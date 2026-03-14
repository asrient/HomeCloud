import Foundation
import VideoToolbox
import UIKit

/// Lightweight H.264 Annex B decoder using VideoToolbox hardware acceleration.
/// Decodes frames and returns raw JPEG bytes for display.
class H264Decoder {
    private var session: VTDecompressionSession?
    private var formatDescription: CMVideoFormatDescription?
    private var lastSPS: Data?
    private var lastPPS: Data?
    private var lastDecodedImage: CGImage?

    deinit {
        destroy()
    }

    /// Feed an Annex B H.264 frame. Returns raw JPEG data on success, nil otherwise.
    func decode(annexBData: Data, isKeyframe: Bool) -> Data? {
        let nalUnits = parseAnnexB(annexBData)
        if nalUnits.isEmpty { return nil }

        if isKeyframe {
            // Extract SPS/PPS from keyframe data and reconfigure if changed
            var sps: Data?
            var pps: Data?
            for nal in nalUnits {
                guard !nal.isEmpty else { continue }
                let nalType = nal[0] & 0x1F
                if nalType == 7 { sps = nal }     // SPS
                else if nalType == 8 { pps = nal } // PPS
            }
            if let sps = sps, let pps = pps {
                if sps != lastSPS || pps != lastPPS {
                    configureSession(sps: sps, pps: pps)
                }
            }
        }

        guard let session = session, let formatDescription = formatDescription else {
            return nil
        }

        // Find the slice NAL (IDR for keyframe, non-IDR for delta)
        var sliceNALs: [Data] = []
        for nal in nalUnits {
            guard !nal.isEmpty else { continue }
            let nalType = nal[0] & 0x1F
            // 5 = IDR slice, 1 = non-IDR slice
            if nalType == 5 || nalType == 1 {
                sliceNALs.append(nal)
            }
        }

        guard !sliceNALs.isEmpty else { return nil }

        // Convert to AVCC format: [4-byte big-endian length][NAL unit data] for each NAL
        var avccData = Data()
        for nal in sliceNALs {
            var length = UInt32(nal.count).bigEndian
            avccData.append(Data(bytes: &length, count: 4))
            avccData.append(nal)
        }

        // Create CMBlockBuffer from AVCC data
        var blockBuffer: CMBlockBuffer?
        let dataLength = avccData.count
        var status = avccData.withUnsafeMutableBytes { rawPtr -> OSStatus in
            guard let baseAddress = rawPtr.baseAddress else { return -1 }
            return CMBlockBufferCreateWithMemoryBlock(
                allocator: kCFAllocatorDefault,
                memoryBlock: baseAddress,
                blockLength: dataLength,
                blockAllocator: kCFAllocatorNull,
                customBlockSource: nil,
                offsetToData: 0,
                dataLength: dataLength,
                flags: 0,
                blockBufferOut: &blockBuffer
            )
        }
        guard status == noErr, let blockBuf = blockBuffer else { return nil }

        // Create CMSampleBuffer
        var sampleBuffer: CMSampleBuffer?
        var sampleSize = dataLength
        status = CMSampleBufferCreateReady(
            allocator: kCFAllocatorDefault,
            dataBuffer: blockBuf,
            formatDescription: formatDescription,
            sampleCount: 1,
            sampleTimingEntryCount: 0,
            sampleTimingArray: nil,
            sampleSizeEntryCount: 1,
            sampleSizeArray: &sampleSize,
            sampleBufferOut: &sampleBuffer
        )
        guard status == noErr, let sampleBuf = sampleBuffer else { return nil }

        // Decode synchronously
        var decodedImage: CGImage?
        let semaphore = DispatchSemaphore(value: 0)

        let decodeFlags: VTDecodeFrameFlags = [._EnableAsynchronousDecompression]
        var infoFlags: VTDecodeInfoFlags = []

        status = VTDecompressionSessionDecodeFrame(
            session,
            sampleBuffer: sampleBuf,
            flags: decodeFlags,
            frameRefcon: nil,
            infoFlagsOut: &infoFlags
        )

        if status == noErr {
            VTDecompressionSessionWaitForAsynchronousFrames(session)
            decodedImage = lastDecodedImage
        }

        guard let image = decodedImage else { return nil }

        // Convert CGImage to JPEG bytes
        let uiImage = UIImage(cgImage: image)
        guard let jpegData = uiImage.jpegData(compressionQuality: 0.7) else { return nil }
        return jpegData
    }

    func destroy() {
        if let session = session {
            VTDecompressionSessionInvalidate(session)
        }
        session = nil
        formatDescription = nil
        lastSPS = nil
        lastPPS = nil
        lastDecodedImage = nil
    }

    // MARK: - Private

    private func configureSession(sps: Data, pps: Data) {
        // Invalidate existing session
        if let session = session {
            VTDecompressionSessionInvalidate(session)
            self.session = nil
        }

        lastSPS = sps
        lastPPS = pps

        // Create format description from SPS/PPS
        // Use contiguous arrays to ensure pointer stability during the C API call
        let spsBytes = [UInt8](sps)
        let ppsBytes = [UInt8](pps)
        var formatDesc: CMVideoFormatDescription?

        let status = spsBytes.withUnsafeBufferPointer { spsBuf in
            ppsBytes.withUnsafeBufferPointer { ppsBuf in
                var pointers: [UnsafePointer<UInt8>] = [spsBuf.baseAddress!, ppsBuf.baseAddress!]
                var sizes: [Int] = [spsBytes.count, ppsBytes.count]
                return CMVideoFormatDescriptionCreateFromH264ParameterSets(
                    allocator: kCFAllocatorDefault,
                    parameterSetCount: 2,
                    parameterSetPointers: &pointers,
                    parameterSetSizes: &sizes,
                    nalUnitHeaderLength: 4,
                    formatDescriptionOut: &formatDesc
                )
            }
        }

        guard status == noErr, let desc = formatDesc else {
            print("[H264Decoder] Failed to create format description: \(status)")
            return
        }
        formatDescription = desc

        // Create decompression session with block-based output handler
        let decoderAttributes: [String: Any] = [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA
        ]

        var decompressionSession: VTDecompressionSession?
        let sessionStatus = VTDecompressionSessionCreate(
            allocator: kCFAllocatorDefault,
            formatDescription: desc,
            decoderSpecification: nil,
            imageBufferAttributes: decoderAttributes as CFDictionary,
            outputCallback: nil,
            decompressionSessionOut: &decompressionSession
        )

        guard sessionStatus == noErr, let sess = decompressionSession else {
            print("[H264Decoder] Failed to create decompression session: \(sessionStatus)")
            return
        }

        // Use block-based handler for decoded frames
        VTDecompressionSessionSetOutputHandler(sess, queue: DispatchQueue.global(qos: .userInteractive)) { [weak self] status, infoFlags, imageBuffer, presentationTimeStamp, duration in
            guard status == noErr, let pixelBuffer = imageBuffer else { return }
            var cgImage: CGImage?
            VTCreateCGImageFromCVPixelBuffer(pixelBuffer, options: nil, imageOut: &cgImage)
            if let img = cgImage {
                self?.lastDecodedImage = img
            }
        }
        session = sess
    }

    /// Parse Annex B byte stream into individual NAL units (without start codes).
    private func parseAnnexB(_ data: Data) -> [Data] {
        var nalUnits: [Data] = []
        let bytes = [UInt8](data)
        let count = bytes.count
        var i = 0

        func findStartCode(from pos: Int) -> Int? {
            var j = pos
            while j < count - 2 {
                if bytes[j] == 0 && bytes[j + 1] == 0 {
                    if j + 2 < count && bytes[j + 2] == 1 {
                        return j
                    }
                    if j + 3 < count && bytes[j + 2] == 0 && bytes[j + 3] == 1 {
                        return j
                    }
                }
                j += 1
            }
            return nil
        }

        func startCodeLength(at pos: Int) -> Int {
            if pos + 3 < count && bytes[pos] == 0 && bytes[pos + 1] == 0 && bytes[pos + 2] == 0 && bytes[pos + 3] == 1 {
                return 4
            }
            if pos + 2 < count && bytes[pos] == 0 && bytes[pos + 1] == 0 && bytes[pos + 2] == 1 {
                return 3
            }
            return 0
        }

        // Find first start code
        guard let firstStart = findStartCode(from: 0) else { return [] }
        i = firstStart + startCodeLength(at: firstStart)

        while i < count {
            if let nextStart = findStartCode(from: i) {
                let nalData = Data(bytes[i..<nextStart])
                if !nalData.isEmpty { nalUnits.append(nalData) }
                i = nextStart + startCodeLength(at: nextStart)
            } else {
                let nalData = Data(bytes[i..<count])
                if !nalData.isEmpty { nalUnits.append(nalData) }
                break
            }
        }

        return nalUnits
    }
}
