package com.asrient.h264player

import android.content.Context
import android.media.MediaCodec
import android.media.MediaFormat
import android.view.Surface
import android.view.SurfaceHolder
import android.view.SurfaceView
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.views.ExpoView
import java.util.concurrent.locks.ReentrantLock

class H264PlayerView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
    private val surfaceView = SurfaceView(context)
    private var currentSession: H264Session? = null
    private var surfaceReady = false

    init {
        surfaceView.layoutParams = LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT)
        addView(surfaceView)

        surfaceView.holder.addCallback(object : SurfaceHolder.Callback {
            override fun surfaceCreated(holder: SurfaceHolder) {
                surfaceReady = true
                currentSession?.attachSurface(holder.surface)
            }

            override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {}

            override fun surfaceDestroyed(holder: SurfaceHolder) {
                surfaceReady = false
                currentSession?.detachSurface()
            }
        })
    }

    fun attachSession(session: H264Session?) {
        if (currentSession === session) return

        // Detach old session
        currentSession?.detachSurface()
        currentSession = session

        // Attach new session if surface is ready
        if (surfaceReady && session != null) {
            session.attachSurface(surfaceView.holder.surface)
        }
    }
}
