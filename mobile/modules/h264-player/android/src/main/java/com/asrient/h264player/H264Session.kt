package com.asrient.h264player

import android.media.MediaCodec
import android.media.MediaFormat
import android.view.Surface
import java.util.concurrent.locks.ReentrantLock

class H264Session(val width: Int, val height: Int) {
    private val lock = ReentrantLock()
    private var codec: MediaCodec? = null
    private var surface: Surface? = null
    private var configured = false
    private var pendingKeyframe: ByteArray? = null  // buffered for replay on surface attach

    fun attachSurface(surface: Surface) {
        lock.lock()
        try {
            // Release existing codec if any
            releaseCodecLocked()

            this.surface = surface

            // Create and configure MediaCodec with the Surface
            val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height)
            val decoder = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
            decoder.configure(format, surface, null, 0)
            decoder.start()
            this.codec = decoder
            this.configured = true

            // Replay buffered keyframe if available
            val pending = pendingKeyframe
            if (pending != null) {
                pendingKeyframe = null
                feedFrameLocked(pending, true)
            }
        } catch (e: Exception) {
            releaseCodecLocked()
        } finally {
            lock.unlock()
        }
    }

    fun detachSurface() {
        lock.lock()
        try {
            releaseCodecLocked()
            surface = null
        } finally {
            lock.unlock()
        }
    }

    fun feedFrame(data: ByteArray, isKeyframe: Boolean) {
        lock.lock()
        try {
            if (codec == null || !configured) {
                // Buffer keyframe for replay when surface/codec becomes available
                if (isKeyframe) pendingKeyframe = data
                return
            }
            feedFrameLocked(data, isKeyframe)
        } finally {
            lock.unlock()
        }
    }

    private fun feedFrameLocked(data: ByteArray, isKeyframe: Boolean) {
        try {
            val decoder = codec ?: return

            // Get an input buffer (wait up to 1ms — avoid blocking lock)
            val inputIndex = decoder.dequeueInputBuffer(1_000)
            if (inputIndex < 0) return

            val inputBuffer = decoder.getInputBuffer(inputIndex) ?: return
            inputBuffer.clear()
            inputBuffer.put(data)

            // Queue the Annex B data — MediaCodec handles SPS/PPS inline
            decoder.queueInputBuffer(inputIndex, 0, data.size, 0, 0)

            // Drain all available output buffers and render to Surface
            val bufferInfo = MediaCodec.BufferInfo()
            while (true) {
                val outputIndex = decoder.dequeueOutputBuffer(bufferInfo, 0)
                if (outputIndex >= 0) {
                    decoder.releaseOutputBuffer(outputIndex, true)
                } else {
                    break
                }
            }
        } catch (e: Exception) {
            if (e is MediaCodec.CodecException && e.isRecoverable) {
                try { codec?.stop() } catch (_: Exception) {}
                try { codec?.start() } catch (_: Exception) { releaseCodecLocked() }
            }
        }
    }

    fun destroy() {
        lock.lock()
        try {
            releaseCodecLocked()
            surface = null
            pendingKeyframe = null
        } finally {
            lock.unlock()
        }
    }

    private fun releaseCodecLocked() {
        try {
            codec?.stop()
        } catch (_: Exception) {}
        try {
            codec?.release()
        } catch (_: Exception) {}
        codec = null
        configured = false
    }
}
