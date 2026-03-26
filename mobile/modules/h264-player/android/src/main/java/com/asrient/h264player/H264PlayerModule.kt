package com.asrient.h264player

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicInteger

class H264PlayerModule : Module() {
    private val sessions = ConcurrentHashMap<String, H264Session>()
    private val sessionCounter = AtomicInteger(0)

    override fun definition() = ModuleDefinition {
        Name("H264Player")

        Function("createSession") { width: Int, height: Int ->
            val id = "h264-${sessionCounter.incrementAndGet()}"
            sessions[id] = H264Session(width, height)
            id
        }

        AsyncFunction("feedFrame") { sessionId: String, data: ByteArray, isKeyframe: Boolean ->
            sessions[sessionId]?.feedFrame(data, isKeyframe)
        }

        Function("destroySession") { sessionId: String ->
            sessions.remove(sessionId)?.destroy()
        }

        View(H264PlayerView::class) {
            Prop("sessionId") { view: H264PlayerView, sessionId: String? ->
                val session = if (sessionId != null) sessions[sessionId] else null
                view.attachSession(session)
            }
        }
    }
}
