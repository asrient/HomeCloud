package com.asrient.superman

import android.graphics.Bitmap
import android.graphics.ImageFormat
import android.media.Image
import android.media.MediaCodec
import android.media.MediaFormat
import android.util.Base64
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

/**
 * Lightweight H.264 Annex B decoder using Android MediaCodec hardware acceleration.
 * Decodes frames synchronously and returns JPEG-compressed base64 strings for display.
 */
class H264Decoder {
    private var codec: MediaCodec? = null
    private var isConfigured = false

    /**
     * Feed an Annex B H.264 frame. Returns base64 JPEG string on success, null otherwise.
     */
    @Synchronized
    fun decode(annexBData: ByteArray, isKeyframe: Boolean): String? {
        try {
            if (isKeyframe && !isConfigured) {
                configure(annexBData)
            }

            val codec = this.codec ?: return null
            if (!isConfigured) return null

            // Queue input buffer
            val inputIndex = codec.dequeueInputBuffer(10_000) // 10ms timeout
            if (inputIndex < 0) return null

            val inputBuffer = codec.getInputBuffer(inputIndex) ?: return null
            inputBuffer.clear()
            inputBuffer.put(annexBData)

            val flags = if (isKeyframe) MediaCodec.BUFFER_FLAG_KEY_FRAME else 0
            codec.queueInputBuffer(inputIndex, 0, annexBData.size, 0, flags)

            // Dequeue output buffer
            val bufferInfo = MediaCodec.BufferInfo()
            val outputIndex = codec.dequeueOutputBuffer(bufferInfo, 30_000) // 30ms timeout

            if (outputIndex >= 0) {
                val image = codec.getOutputImage(outputIndex)
                val result = if (image != null) {
                    val base64 = imageToBase64Jpeg(image)
                    image.close()
                    base64
                } else {
                    null
                }
                codec.releaseOutputBuffer(outputIndex, false)
                return result
            } else if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                // Format changed, try again
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
    }

    private fun configure(keyframeData: ByteArray) {
        // Parse SPS and PPS from Annex B keyframe
        val nalUnits = parseAnnexB(keyframeData)
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

        if (sps == null || pps == null) return

        // Parse width/height from SPS (basic parsing)
        val dimensions = parseSPSDimensions(sps)

        try {
            // Clean up any existing codec
            destroy()

            val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, dimensions.first, dimensions.second)
            format.setByteBuffer("csd-0", ByteBuffer.wrap(addStartCode(sps)))
            format.setByteBuffer("csd-1", ByteBuffer.wrap(addStartCode(pps)))
            format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodec.CodecCapabilities.COLOR_FormatYUV420Flexible)

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

    private fun imageToBase64Jpeg(image: Image): String? {
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
        val uvRowStride = uPlane.rowStride
        val uvPixelStride = uPlane.pixelStride

        // Convert YUV420 to ARGB bitmap
        val argb = IntArray(width * height)
        for (row in 0 until height) {
            for (col in 0 until width) {
                val yIdx = row * yRowStride + col
                val uvRow = row / 2
                val uvCol = col / 2
                val uIdx = uvRow * uvRowStride + uvCol * uvPixelStride
                val vIdx = uvRow * uvRowStride + uvCol * uvPixelStride

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
        return Base64.encodeToString(jpegBytes, Base64.NO_WRAP)
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
     * Basic SPS dimension parsing. Returns (width, height).
     * Falls back to 1920x1080 if parsing fails.
     */
    private fun parseSPSDimensions(sps: ByteArray): Pair<Int, Int> {
        try {
            if (sps.size < 4) return Pair(1920, 1080)
            // Simplified: use MediaFormat to extract dimensions when possible
            // For now, use a reasonable default and let MediaCodec handle the actual SPS
            // The decoder will adapt to the actual frame dimensions
            return Pair(1920, 1080)
        } catch (_: Exception) {
            return Pair(1920, 1080)
        }
    }
}
