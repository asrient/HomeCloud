package com.asrient.h264player

import android.content.Context
import android.graphics.SurfaceTexture
import android.view.Surface
import android.view.TextureView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView

class H264PlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val textureView = TextureView(context)
    private var currentSession: H264Session? = null
    private var surfaceReady = false
    private var currentSurface: Surface? = null

    init {
        textureView.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        addView(textureView)

        textureView.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
            override fun onSurfaceTextureAvailable(st: SurfaceTexture, width: Int, height: Int) {
                surfaceReady = true
                val surface = Surface(st)
                currentSurface = surface
                // If the codec is already running, attachSurface will hot-swap
                // via setOutputSurface — no keyframe needed.
                currentSession?.attachSurface(surface)
            }

            override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, width: Int, height: Int) {}

            override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean {
                surfaceReady = false
                // Don't stop the codec — just mark the surface as invalid.
                // The codec keeps running so when a new surface arrives,
                // setOutputSurface can swap it without needing a keyframe.
                currentSession?.onSurfaceInvalidated()
                currentSurface?.release()
                currentSurface = null
                return true
            }

            override fun onSurfaceTextureUpdated(st: SurfaceTexture) {}
        }
    }

    fun attachSession(session: H264Session?) {
        if (currentSession === session) return

        // Fully detach old session (stops codec)
        currentSession?.detachSurface()
        currentSession = session

        // Attach new session if surface is ready
        if (surfaceReady && session != null && currentSurface != null) {
            session.attachSurface(currentSurface!!)
        }
    }
}
