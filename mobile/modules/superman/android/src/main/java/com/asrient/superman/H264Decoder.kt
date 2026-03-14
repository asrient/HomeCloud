package com.asrient.superman

import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.media.Image
import android.media.MediaCodec
import android.media.MediaFormat
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

/**
 * H.264 Annex B decoder using Android MediaCodec hardware acceleration.
 * Each instance maintains its own codec session. Decodes frames synchronously
 * and returns raw JPEG bytes for display.
 *
 * @see <a href="https://developer.android.com/reference/android/media/MediaCodec">MediaCodec docs</a>
 */
class H264Decoder {
    private var codec: MediaCodec? = null
    private var isConfigured = false
    private var lastSPS: ByteArray? = null
    private var lastPPS: ByteArray? = null

    /**
     * Feed an Annex B H.264 frame. Returns raw JPEG bytes on success, null otherwise.
     */
    @Synchronized
    fun decode(annexBData: ByteArray, isKeyframe: Boolean): ByteArray? {
        try {
            if (isKeyframe) {
                // Extract SPS/PPS from keyframe and (re)configure if changed
                val nalUnits = parseAnnexB(annexBData)
                var sps: ByteArray? = null
                var pps: ByteArray? = null
                for (nal in nalUnits) {
                    if (nal.isEmpty()) continue
                    val nalType = nal[0].toInt() and 0x1F
                    when (nalType) {
                        7 -> sps = nal  // SPS
                        8 -> pps = nal  // PPS
                    }
                }
                if (sps != null && pps != null) {
                    if (!isConfigured || !sps.contentEquals(lastSPS) || !pps.contentEquals(lastPPS)) {
                        configure(sps, pps)
                    }
                }
            }

            val codec = this.codec ?: return null
            if (!isConfigured) return null

            // Queue input buffer with no special flags for decoder input.
            // Per Android docs, BUFFER_FLAG_KEY_FRAME is an output/encoder flag —
            // decoders infer frame type from the NAL unit headers in the bitstream.
            val inputIndex = codec.dequeueInputBuffer(10_000) // 10ms timeout
            if (inputIndex < 0) return null

            val inputBuffer = codec.getInputBuffer(inputIndex) ?: return null
            inputBuffer.clear()
            inputBuffer.put(annexBData)

            codec.queueInputBuffer(inputIndex, 0, annexBData.size, 0, 0)

            // Dequeue output buffer
            val bufferInfo = MediaCodec.BufferInfo()
            val outputIndex = codec.dequeueOutputBuffer(bufferInfo, 30_000) // 30ms timeout

            if (outputIndex >= 0) {
                val image = codec.getOutputImage(outputIndex)
                val result = if (image != null) {
                    val jpegBytes = imageToJpegBytes(image)
                    image.close()
                    jpegBytes
                } else {
                    null
                }
                codec.releaseOutputBuffer(outputIndex, false)
                return result
            } else if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                // Format changed, try again on next frame
                return null
            }

            return null
        } catch (e: Exception) {
            android.util.Log.e("H264Decoder", "Decode error: ${e.message}")
            return null
        }
    }

    @Synchronized
    fun destroy() {
        try {
            codec?.stop()
            codec?.release()
        } catch (_: Exception) {}
        codec = null
        isConfigured = false
        lastSPS = null
        lastPPS = null
    }

    private fun configure(sps: ByteArray, pps: ByteArray) {
        // Clean up any existing codec
        try {
            codec?.stop()
            codec?.release()
        } catch (_: Exception) {}
        codec = null
        isConfigured = false

        lastSPS = sps.copyOf()
        lastPPS = pps.copyOf()

        val dimensions = parseSPSDimensions(sps)

        try {
            val format = MediaFormat.createVideoFormat(
                MediaFormat.MIMETYPE_VIDEO_AVC,
                dimensions.first,
                dimensions.second
            )
            // Codec-specific data: SPS (csd-0) and PPS (csd-1) in Annex B format
            format.setByteBuffer("csd-0", ByteBuffer.wrap(addStartCode(sps)))
            format.setByteBuffer("csd-1", ByteBuffer.wrap(addStartCode(pps)))
            format.setInteger(
                MediaFormat.KEY_COLOR_FORMAT,
                MediaCodec.CodecCapabilities.COLOR_FormatYUV420Flexible
            )

            val decoder = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
            decoder.configure(format, null, null, 0)
            decoder.start()

            codec = decoder
            isConfigured = true
        } catch (e: Exception) {
            android.util.Log.e("H264Decoder", "Configure error: ${e.message}")
            isConfigured = false
        }
    }

    private fun addStartCode(nal: ByteArray): ByteArray {
        val result = ByteArray(4 + nal.size)
        result[0] = 0; result[1] = 0; result[2] = 0; result[3] = 1
        System.arraycopy(nal, 0, result, 4, nal.size)
        return result
    }

    private fun imageToJpegBytes(image: Image): ByteArray? {
        if (image.format != ImageFormat.YUV_420_888) return null

        val width = image.width
        val height = image.height
        val yPlane = image.planes[0]
        val uPlane = image.planes[1]
        val vPlane = image.planes[2]

        val yBuffer = yPlane.buffer
        val uBuffer = uPlane.buffer
        val vBuffer = vPlane.buffer

        val yRowStride = yPlane.rowStride
        val uRowStride = uPlane.rowStride
        val uPixelStride = uPlane.pixelStride
        val vRowStride = vPlane.rowStride
        val vPixelStride = vPlane.pixelStride

        // Convert YUV420 to ARGB bitmap
        val argb = IntArray(width * height)
        for (row in 0 until height) {
            for (col in 0 until width) {
                val yIdx = row * yRowStride + col
                val uvRow = row / 2
                val uvCol = col / 2
                val uIdx = uvRow * uRowStride + uvCol * uPixelStride
                val vIdx = uvRow * vRowStride + uvCol * vPixelStride

                val y = (yBuffer.get(yIdx).toInt() and 0xFF) - 16
                val u = (uBuffer.get(uIdx).toInt() and 0xFF) - 128
                val v = (vBuffer.get(vIdx).toInt() and 0xFF) - 128

                var r = (1.164 * y + 1.596 * v).toInt()
                var g = (1.164 * y - 0.813 * v - 0.391 * u).toInt()
                var b = (1.164 * y + 2.018 * u).toInt()

                r = r.coerceIn(0, 255)
                g = g.coerceIn(0, 255)
                b = b.coerceIn(0, 255)

                argb[row * width + col] = (0xFF shl 24) or (r shl 16) or (g shl 8) or b
            }
        }

        val bitmap = Bitmap.createBitmap(argb, width, height, Bitmap.Config.ARGB_8888)
        val outputStream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 70, outputStream)
        bitmap.recycle()

        val jpegBytes = outputStream.toByteArray()
        outputStream.close()
        return jpegBytes
    }

    /**
     * Parse Annex B byte stream into individual NAL units (without start codes).
     */
    private fun parseAnnexB(data: ByteArray): List<ByteArray> {
        val nalUnits = mutableListOf<ByteArray>()
        val size = data.size
        var i = 0

        fun findStartCode(from: Int): Int {
            var j = from
            while (j < size - 2) {
                if (data[j] == 0.toByte() && data[j + 1] == 0.toByte()) {
                    if (j + 2 < size && data[j + 2] == 1.toByte()) return j
                    if (j + 3 < size && data[j + 2] == 0.toByte() && data[j + 3] == 1.toByte()) return j
                }
                j++
            }
            return -1
        }

        fun startCodeLen(at: Int): Int {
            if (at + 3 < size && data[at] == 0.toByte() && data[at + 1] == 0.toByte() &&
                data[at + 2] == 0.toByte() && data[at + 3] == 1.toByte()) return 4
            if (at + 2 < size && data[at] == 0.toByte() && data[at + 1] == 0.toByte() &&
                data[at + 2] == 1.toByte()) return 3
            return 0
        }

        val firstStart = findStartCode(0)
        if (firstStart < 0) return nalUnits
        i = firstStart + startCodeLen(firstStart)

        while (i < size) {
            val nextStart = findStartCode(i)
            if (nextStart >= 0) {
                val nal = data.copyOfRange(i, nextStart)
                if (nal.isNotEmpty()) nalUnits.add(nal)
                i = nextStart + startCodeLen(nextStart)
            } else {
                val nal = data.copyOfRange(i, size)
                if (nal.isNotEmpty()) nalUnits.add(nal)
                break
            }
        }

        return nalUnits
    }

    /**
     * Parse width and height from an H.264 SPS NAL unit.
     * Handles emulation prevention byte removal and exp-Golomb decoding
     * per ITU-T H.264 §7.3.2.1.1.
     */
    private fun parseSPSDimensions(sps: ByteArray): Pair<Int, Int> {
        try {
            if (sps.size < 4) return Pair(1920, 1080)

            // Remove emulation prevention bytes (0x00 0x00 0x03 → 0x00 0x00)
            val rbsp = removeEmulationPrevention(sps)
            val reader = BitReader(rbsp)

            // forbidden_zero_bit (1) + nal_ref_idc (2) + nal_unit_type (5)
            reader.skip(8)

            val profileIdc = reader.readBits(8)
            reader.skip(8) // constraint_set flags + reserved
            reader.skip(8) // level_idc
            reader.readExpGolomb() // seq_parameter_set_id

            val highProfiles = setOf(100, 110, 122, 244, 44, 83, 86, 118, 128, 138, 139, 134, 135)
            var chromaFormatIdc = 1
            if (profileIdc in highProfiles) {
                chromaFormatIdc = reader.readExpGolomb()
                if (chromaFormatIdc == 3) {
                    reader.skip(1) // separate_colour_plane_flag
                }
                reader.readExpGolomb() // bit_depth_luma_minus8
                reader.readExpGolomb() // bit_depth_chroma_minus8
                reader.skip(1) // qpprime_y_zero_transform_bypass_flag
                val seqScalingMatrixPresent = reader.readBit()
                if (seqScalingMatrixPresent == 1) {
                    val count = if (chromaFormatIdc != 3) 8 else 12
                    for (i in 0 until count) {
                        val present = reader.readBit()
                        if (present == 1) {
                            skipScalingList(reader, if (i < 6) 16 else 64)
                        }
                    }
                }
            }

            reader.readExpGolomb() // log2_max_frame_num_minus4
            val picOrderCntType = reader.readExpGolomb()
            if (picOrderCntType == 0) {
                reader.readExpGolomb() // log2_max_pic_order_cnt_lsb_minus4
            } else if (picOrderCntType == 1) {
                reader.skip(1) // delta_pic_order_always_zero_flag
                reader.readSignedExpGolomb() // offset_for_non_ref_pic
                reader.readSignedExpGolomb() // offset_for_top_to_bottom_field
                val numRefFrames = reader.readExpGolomb()
                for (i in 0 until numRefFrames) {
                    reader.readSignedExpGolomb() // offset_for_ref_frame
                }
            }

            reader.readExpGolomb() // max_num_ref_frames
            reader.skip(1) // gaps_in_frame_num_value_allowed_flag

            val picWidthInMbsMinus1 = reader.readExpGolomb()
            val picHeightInMapUnitsMinus1 = reader.readExpGolomb()
            val frameMbsOnlyFlag = reader.readBit()

            if (frameMbsOnlyFlag == 0) {
                reader.skip(1) // mb_adaptive_frame_field_flag
            }
            reader.skip(1) // direct_8x8_inference_flag

            var width = (picWidthInMbsMinus1 + 1) * 16
            var height = (2 - frameMbsOnlyFlag) * (picHeightInMapUnitsMinus1 + 1) * 16

            val frameCroppingFlag = reader.readBit()
            if (frameCroppingFlag == 1) {
                val cropLeft = reader.readExpGolomb()
                val cropRight = reader.readExpGolomb()
                val cropTop = reader.readExpGolomb()
                val cropBottom = reader.readExpGolomb()

                // Chroma array type affects crop unit
                val subWidthC = if (chromaFormatIdc == 1 || chromaFormatIdc == 2) 2 else 1
                val subHeightC = if (chromaFormatIdc == 1) 2 else 1
                val cropUnitX = subWidthC
                val cropUnitY = subHeightC * (2 - frameMbsOnlyFlag)

                width -= (cropLeft + cropRight) * cropUnitX
                height -= (cropTop + cropBottom) * cropUnitY
            }

            if (width > 0 && height > 0) {
                return Pair(width, height)
            }
        } catch (e: Exception) {
            android.util.Log.w("H264Decoder", "SPS parse failed, using fallback: ${e.message}")
        }
        return Pair(1920, 1080)
    }

    /**
     * Remove emulation prevention bytes from NAL unit data.
     * Sequences of 0x00 0x00 0x03 are replaced with 0x00 0x00.
     */
    private fun removeEmulationPrevention(data: ByteArray): ByteArray {
        val result = ByteArrayOutputStream(data.size)
        var i = 0
        while (i < data.size) {
            if (i + 2 < data.size &&
                data[i] == 0.toByte() && data[i + 1] == 0.toByte() && data[i + 2] == 3.toByte()
            ) {
                result.write(0)
                result.write(0)
                i += 3 // skip the 0x03 byte
            } else {
                result.write(data[i].toInt() and 0xFF)
                i++
            }
        }
        return result.toByteArray()
    }

    private fun skipScalingList(reader: BitReader, size: Int) {
        var lastScale = 8
        var nextScale = 8
        for (j in 0 until size) {
            if (nextScale != 0) {
                val deltaScale = reader.readSignedExpGolomb()
                nextScale = (lastScale + deltaScale + 256) % 256
            }
            lastScale = if (nextScale == 0) lastScale else nextScale
        }
    }

    /**
     * Bitwise reader for parsing SPS fields.
     */
    private class BitReader(private val data: ByteArray) {
        private var byteOffset = 0
        private var bitOffset = 0

        fun readBit(): Int {
            if (byteOffset >= data.size) return 0
            val bit = (data[byteOffset].toInt() shr (7 - bitOffset)) and 1
            bitOffset++
            if (bitOffset == 8) {
                bitOffset = 0
                byteOffset++
            }
            return bit
        }

        fun readBits(n: Int): Int {
            var value = 0
            for (i in 0 until n) {
                value = (value shl 1) or readBit()
            }
            return value
        }

        fun skip(n: Int) {
            for (i in 0 until n) readBit()
        }

        /** Unsigned exp-Golomb (ue(v)) */
        fun readExpGolomb(): Int {
            var leadingZeros = 0
            while (readBit() == 0) {
                leadingZeros++
                if (leadingZeros > 31) return 0 // safety
            }
            if (leadingZeros == 0) return 0
            return (1 shl leadingZeros) - 1 + readBits(leadingZeros)
        }

        /** Signed exp-Golomb (se(v)) */
        fun readSignedExpGolomb(): Int {
            val value = readExpGolomb()
            return if (value % 2 == 0) -(value / 2) else (value + 1) / 2
        }
    }
}
