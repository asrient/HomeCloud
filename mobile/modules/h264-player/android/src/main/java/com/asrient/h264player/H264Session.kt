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
    private var waitingForKeyframe = true
    private var baseTimeNs = 0L  // System.nanoTime() at first frame, for monotonic timestamps
    private var surfaceValid = false  // tracks whether current surface can be rendered to

    fun attachSurface(surface: Surface) {
        lock.lock()
        try {
            this.surface = surface
            this.surfaceValid = true

            if (codec != null && configured) {
                // Codec already running — hot-swap the output surface without resetting.
                // This preserves decoder state so no keyframe is needed.
                try {
                    codec!!.setOutputSurface(surface)
                    // Drain any pending output to the new surface
                    drainOutput(codec!!)
                    return
                } catch (e: Exception) {
                    // setOutputSurface failed — fall through to full restart
                }
            }

            // Full codec setup (first time or after error)
            releaseCodecLocked()
            this.surface = surface
            this.surfaceValid = true

            val format = MediaFormat.createVideoFormat(MediaFormat.MIMETYPE_VIDEO_AVC, width, height)
            val decoder = MediaCodec.createDecoderByType(MediaFormat.MIMETYPE_VIDEO_AVC)
            decoder.configure(format, surface, null, 0)
            decoder.start()
            this.codec = decoder
            this.configured = true
            this.waitingForKeyframe = true
            this.baseTimeNs = 0L

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

    /**
     * Marks the surface as invalid (destroyed by the system) without
     * stopping the codec. The codec keeps its state so when a new
     * surface arrives via [attachSurface], setOutputSurface can
     * hot-swap it without needing a keyframe.
     */
    fun onSurfaceInvalidated() {
        lock.lock()
        try {
            surfaceValid = false
            surface = null
        } finally {
            lock.unlock()
        }
    }

    fun detachSurface() {
        lock.lock()
        try {
            releaseCodecLocked()
            surface = null
            surfaceValid = false
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

    /**
     * Find next Annex-B start code (00 00 01 or 00 00 00 01) at or after [pos].
     * Returns the index of the first byte AFTER the start code, or -1.
     */
    private fun nextNalStart(data: ByteArray, pos: Int): Int {
        var p = pos
        val len = data.size
        while (p < len - 2) {
            if (data[p] == 0.toByte() && data[p + 1] == 0.toByte()) {
                if (data[p + 2] == 1.toByte()) return p + 3
                if (p < len - 3 && data[p + 2] == 0.toByte() && data[p + 3] == 1.toByte()) return p + 4
            }
            p++
        }
        return -1
    }

    /** Extract SPS+PPS (NAL types 7,8) as a single Annex-B blob for BUFFER_FLAG_CODEC_CONFIG. */
    private fun extractCodecConfig(data: ByteArray): ByteArray? {
        val configParts = mutableListOf<ByteArray>()
        var start = nextNalStart(data, 0)
        while (start >= 0 && start < data.size) {
            val next = nextNalStart(data, start)
            val end = if (next >= 0) {
                var e = next - 3; if (e > 0 && data[e - 1] == 0.toByte()) e--; e
            } else data.size
            val nalType = data[start].toInt() and 0x1F
            if (nalType == 7 || nalType == 8) {  // SPS or PPS
                // Re-wrap with 4-byte start code
                val nalu = ByteArray(4 + (end - start))
                nalu[3] = 1
                System.arraycopy(data, start, nalu, 4, end - start)
                configParts.add(nalu)
            }
            start = next
        }
        if (configParts.isEmpty()) return null
        val total = configParts.sumOf { it.size }
        val buf = ByteArray(total)
        var off = 0
        for (part in configParts) { System.arraycopy(part, 0, buf, off, part.size); off += part.size }
        return buf
    }

    private fun queueBuffer(decoder: MediaCodec, data: ByteArray, timestampUs: Long, flags: Int): Boolean {
        val idx = decoder.dequeueInputBuffer(10_000)
        if (idx < 0) return false
        val buf = decoder.getInputBuffer(idx) ?: return false
        buf.clear(); buf.put(data)
        decoder.queueInputBuffer(idx, 0, data.size, timestampUs, flags)
        return true
    }

    private fun drainOutput(decoder: MediaCodec) {
        val info = MediaCodec.BufferInfo()
        while (true) {
            val idx = decoder.dequeueOutputBuffer(info, 0)
            if (idx >= 0) {
                // Only render if we have a valid surface; otherwise just release the buffer
                decoder.releaseOutputBuffer(idx, surfaceValid)
            } else break
        }
    }

    private fun feedFrameLocked(data: ByteArray, isKeyframe: Boolean) {
        try {
            val decoder = codec ?: return

            // Skip non-keyframes until we receive the first keyframe
            if (!isKeyframe && waitingForKeyframe) return

            // On keyframes, extract SPS/PPS and submit with BUFFER_FLAG_CODEC_CONFIG
            // per Android docs: "must be submitted after start() and before any frame data"
            if (isKeyframe) {
                val config = extractCodecConfig(data)
                if (config != null) {
                    queueBuffer(decoder, config, 0, MediaCodec.BUFFER_FLAG_CODEC_CONFIG)
                }
            }

            // Use monotonic clock for unique timestamps (no hardcoded FPS)
            if (baseTimeNs == 0L) baseTimeNs = System.nanoTime()
            val presentationTimeUs = (System.nanoTime() - baseTimeNs) / 1000
            queueBuffer(decoder, data, presentationTimeUs, 0)
            if (isKeyframe) waitingForKeyframe = false

            drainOutput(decoder)
        } catch (e: Exception) {
            if (e is MediaCodec.CodecException && e.isRecoverable) {
                try { codec?.stop() } catch (_: Exception) {}
                try { codec?.start() } catch (_: Exception) { releaseCodecLocked() }
                waitingForKeyframe = true
            }
        }
    }

    fun destroy() {
        lock.lock()
        try {
            releaseCodecLocked()
            surface = null
            surfaceValid = false
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
        waitingForKeyframe = true
    }
}
