import ExpoModulesCore
import AVFoundation
import VideoToolbox
import CoreMedia

public class H264PlayerModule: Module {
  private var sessions: [String: H264Session] = [:]
  private var sessionCounter = 0
  private let lock = NSLock()

  public func definition() -> ModuleDefinition {
    Name("H264Player")

    Function("createSession") { (width: Int, height: Int) -> String in
      self.lock.lock()
      self.sessionCounter += 1
      let sessionId = "h264-\(self.sessionCounter)"
      self.sessions[sessionId] = H264Session(width: width, height: height)
      self.lock.unlock()
      return sessionId
    }

    AsyncFunction("feedFrame") { (sessionId: String, data: Data, isKeyframe: Bool, promise: Promise) in
      self.lock.lock()
      let session = self.sessions[sessionId]
      self.lock.unlock()
      if let session = session {
        session.feedFrame(data: data, isKeyframe: isKeyframe) {
          promise.resolve(nil)
        }
      } else {
        promise.resolve(nil)
      }
    }

    Function("destroySession") { (sessionId: String) in
      self.lock.lock()
      let session = self.sessions.removeValue(forKey: sessionId)
      self.lock.unlock()
      session?.destroy()
    }

    View(H264PlayerView.self) {
      Prop("sessionId") { (view: H264PlayerView, sessionId: String?) in
        if let sid = sessionId {
          self.lock.lock()
          let session = self.sessions[sid]
          self.lock.unlock()
          view.attachSession(session)
        } else {
          view.attachSession(nil)
        }
      }
    }
  }
}

// MARK: - H264 Session using AVSampleBufferDisplayLayer

class H264Session {
  private let queue = DispatchQueue(label: "h264player.session", qos: .userInteractive)
  private var formatDesc: CMVideoFormatDescription?
  private var currentSPS: Data?
  private var currentPPS: Data?
  private weak var displayLayer: AVSampleBufferDisplayLayer?
  private var waitingForKeyframe = true
  private var pendingKeyframe: CMSampleBuffer?  // buffered keyframe for replay on layer attach
  let width: Int
  let height: Int

  init(width: Int, height: Int) {
    self.width = width
    self.height = height
  }

  func attachLayer(_ layer: AVSampleBufferDisplayLayer?) {
    queue.async {
      self.displayLayer = layer
      self.waitingForKeyframe = true
      // Replay buffered keyframe if available
      if let layer = layer, let sb = self.pendingKeyframe {
        layer.enqueue(sb)
        if layer.status == .failed {
          layer.flush()
          layer.enqueue(sb)
        }
        if layer.status != .failed {
          self.waitingForKeyframe = false
        }
        self.pendingKeyframe = nil
      }
    }
  }

  func feedFrame(data rawData: Data, isKeyframe: Bool, completion: @escaping () -> Void) {
    queue.async {
      defer { completion() }
      let data = Data(rawData)
      let nalUnits = self.parseAnnexB(data: data)
      if nalUnits.isEmpty { return }

      if isKeyframe {
        var sps: Data?
        var pps: Data?
        for nalu in nalUnits {
          guard !nalu.isEmpty else { continue }
          let nd = Data(nalu)
          let t = nd[0] & 0x1F
          if t == 7 { sps = nd }
          else if t == 8 { pps = nd }
        }
        if let sps = sps, let pps = pps,
           sps != self.currentSPS || pps != self.currentPPS {
          self.currentSPS = sps
          self.currentPPS = pps
          self.formatDesc = self.createFormatDescription(sps: sps, pps: pps)
        }
      }

      guard let formatDesc = self.formatDesc else { return }
      let layer = self.displayLayer
      // If no layer yet but have formatDesc, still build the sample buffer
      // so we can buffer keyframes for replay on layer attach
      if layer == nil && !isKeyframe { return }
      if let layer = layer {
        if !isKeyframe && self.waitingForKeyframe { return }
        if layer.status == .failed {
          layer.flush()
          self.waitingForKeyframe = true
          return
        }
      }

      var avccData = Data()
      for nalu in nalUnits {
        let nd = Data(nalu)
        guard !nd.isEmpty else { continue }
        let t = nd[0] & 0x1F
        guard t >= 1 && t <= 5 else { continue }
        var len = UInt32(nd.count).bigEndian
        avccData.append(Data(bytes: &len, count: 4))
        avccData.append(nd)
      }
      if avccData.isEmpty { return }

      let avccLen = avccData.count
      var blockBuf: CMBlockBuffer?
      var status = CMBlockBufferCreateWithMemoryBlock(
        allocator: kCFAllocatorDefault, memoryBlock: nil, blockLength: avccLen,
        blockAllocator: kCFAllocatorDefault, customBlockSource: nil,
        offsetToData: 0, dataLength: avccLen,
        flags: kCMBlockBufferAssureMemoryNowFlag, blockBufferOut: &blockBuf)
      guard status == noErr, let bb = blockBuf else { return }

      avccData.withUnsafeBytes { ptr in
        if let base = ptr.baseAddress {
          CMBlockBufferReplaceDataBytes(with: base, blockBuffer: bb,
            offsetIntoDestination: 0, dataLength: avccLen)
        }
      }

      var sampleBuf: CMSampleBuffer?
      var size = avccLen
      var timing = CMSampleTimingInfo(duration: .invalid, presentationTimeStamp: .zero, decodeTimeStamp: .invalid)
      status = CMSampleBufferCreateReady(
        allocator: kCFAllocatorDefault, dataBuffer: bb, formatDescription: formatDesc,
        sampleCount: 1, sampleTimingEntryCount: 1, sampleTimingArray: &timing,
        sampleSizeEntryCount: 1, sampleSizeArray: &size, sampleBufferOut: &sampleBuf)
      guard status == noErr, let sb = sampleBuf else { return }

      if let attachments = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: true) as? [NSMutableDictionary],
         let dict = attachments.first {
        dict[kCMSampleAttachmentKey_DisplayImmediately] = true
      }

      // If no layer yet, buffer the keyframe for replay when layer attaches
      guard let layer = layer else {
        if isKeyframe { self.pendingKeyframe = sb }
        return
      }

      layer.enqueue(sb)
      if isKeyframe { self.waitingForKeyframe = false }

      // If enqueuing a keyframe fails, flush and retry once
      if layer.status == .failed && isKeyframe {
        layer.flush()
        layer.enqueue(sb)
        if layer.status != .failed {
          self.waitingForKeyframe = false
        } else {
          self.waitingForKeyframe = true
          self.pendingKeyframe = sb  // save for later retry
        }
      } else if layer.status == .failed {
        layer.flush()
        self.waitingForKeyframe = true
      }
    }
  }

  func destroy() {
    queue.async {
      self.displayLayer = nil
      self.formatDesc = nil
      self.currentSPS = nil
      self.currentPPS = nil
      self.pendingKeyframe = nil
    }
  }

  // MARK: - Annex B Parsing

  private func parseAnnexB(data: Data) -> [Data] {
    var nalUnits: [Data] = []
    var i = 0
    let count = data.count
    var nalStart = -1

    while i < count {
      if i + 2 < count && data[i] == 0 && data[i+1] == 0 {
        var startCodeLen = 0
        if data[i+2] == 1 {
          startCodeLen = 3
        } else if i + 3 < count && data[i+2] == 0 && data[i+3] == 1 {
          startCodeLen = 4
        }

        if startCodeLen > 0 {
          if nalStart >= 0 {
            nalUnits.append(data[nalStart..<i])
          }
          nalStart = i + startCodeLen
          i += startCodeLen
          continue
        }
      }
      i += 1
    }

    if nalStart >= 0 && nalStart < count {
      nalUnits.append(data[nalStart..<count])
    }

    return nalUnits
  }

  // MARK: - Format Description

  private func createFormatDescription(sps: Data, pps: Data) -> CMVideoFormatDescription? {
    var formatDesc: CMVideoFormatDescription?
    let spsBytes = Array(sps)
    let ppsBytes = Array(pps)

    let status: OSStatus = spsBytes.withUnsafeBufferPointer { spsBuf in
      ppsBytes.withUnsafeBufferPointer { ppsBuf in
        var pointers: [UnsafePointer<UInt8>] = [spsBuf.baseAddress!, ppsBuf.baseAddress!]
        var sizes: [Int] = [spsBytes.count, ppsBytes.count]

        return pointers.withUnsafeMutableBufferPointer { ptrBuf in
          sizes.withUnsafeMutableBufferPointer { sizeBuf in
            CMVideoFormatDescriptionCreateFromH264ParameterSets(
              allocator: kCFAllocatorDefault,
              parameterSetCount: 2,
              parameterSetPointers: ptrBuf.baseAddress!,
              parameterSetSizes: sizeBuf.baseAddress!,
              nalUnitHeaderLength: 4,
              formatDescriptionOut: &formatDesc
            )
          }
        }
      }
    }

    if status != noErr {
      NSLog("[H264Player] createFormatDescription failed: %d", status)
    }
    return status == noErr ? formatDesc : nil
  }
}
