package com.asrient.superman

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.graphics.Bitmap
import android.media.ThumbnailUtils
import android.net.Uri
import android.util.Size
import android.webkit.MimeTypeMap
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.InetSocketAddress
import java.nio.ByteBuffer
import expo.modules.kotlin.types.Enumerable
import android.os.Environment
import android.content.Context
import android.os.Build
import android.os.storage.StorageManager
import androidx.core.content.ContextCompat
import java.nio.channels.SocketChannel
import java.nio.channels.SelectionKey
import java.nio.channels.Selector
import java.net.DatagramSocket
import java.net.DatagramPacket
import java.net.InetAddress
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.*
import expo.modules.kotlin.Promise
import java.util.concurrent.ConcurrentLinkedQueue
import kotlin.coroutines.CoroutineContext

enum class StandardDirectory(val value: String) : Enumerable {
  DOCUMENTS("Documents"),
  DOWNLOADS("Downloads"),
  PICTURES("Pictures"),
  VIDEOS("Videos"),
  MUSIC("Music"),
  MOVIES("Movies"),
  PHONE_STORAGE("Phone Storage"),
  SD_CARD("SD Card");
}

class SupermanModule : Module() {
  // TCP connection management
  private val tcpConnections = ConcurrentHashMap<String, TcpConnection>()
  private val connectionIdCounter = java.util.concurrent.atomic.AtomicInteger(0)

  // UDP socket management
  private val udpSockets = ConcurrentHashMap<String, UdpSocket>()
  private val socketIdCounter = java.util.concurrent.atomic.AtomicInteger(0)

  // Shared selector manager for all non-blocking socket readiness notifications
  private val selectorManager = SelectorManager()

  // Coroutine scope for connection coroutines
  private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.Default)

  data class TcpConnection(
    val socketChannel: SocketChannel,
    val writer: SendChannel<ByteArray>,
    val readerJob: Job,
    val writerJob: Job
  )

  data class UdpSocket(
    val socket: DatagramSocket,
    val job: Job,
    val socketId: String
  )

  // Helper function to get MIME type
  private fun getMimeType(filePath: String): String? {
    val extension = filePath.substringAfterLast('.', "")
    return if (extension.isNotEmpty()) {
      MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.lowercase())
    } else {
      null
    }
  }

  // Helper function to get context
  private fun getContext(): Context {
    return appContext.reactContext ?: throw IllegalStateException("React context not available")
  }

  // Helper functions for public directories (unchanged)
  private fun getPublicDirectory(environmentConstant: String): String? {
    return try {
      val publicDir = Environment.getExternalStoragePublicDirectory(environmentConstant)
        ?: return null

      if (!publicDir.exists()) {
        publicDir.mkdirs()
      }

      Uri.fromFile(publicDir).toString()
    } catch (e: Exception) {
      null
    }
  }

  private fun getPhoneStorageRoot(): String? {
    return try {
      @Suppress("DEPRECATION")
      Environment.getExternalStorageDirectory()?.let { Uri.fromFile(it).toString() }
    } catch (e: Exception) {
      null
    }
  }

  private fun getSDCardPath(): String? {
    return try {
      val context = getContext()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        val storageManager = context.getSystemService(Context.STORAGE_SERVICE) as StorageManager
        storageManager.storageVolumes.find { volume ->
          volume.isRemovable && !volume.isPrimary
        }?.directory?.let { sdPath ->
          Uri.fromFile(sdPath).toString()
        }
      } else {
        val externalDirs = ContextCompat.getExternalFilesDirs(context, null)
        externalDirs.find { dir ->
          dir != null && Environment.isExternalStorageRemovable(dir)
        }?.let { sdCardDir ->
          val sdCardRoot = sdCardDir.parentFile?.parentFile?.parentFile?.parentFile
          sdCardRoot?.let { Uri.fromFile(it).toString() }
        }
      }
    } catch (e: Exception) {
      null
    }
  }

  override fun definition() = ModuleDefinition {
    Name("Superman")

    Function("hello") { "Hello world! 👋" }

    Function("getStandardDirectoryUri") { standardDirectory: StandardDirectory ->
      val directoryUri = when (standardDirectory) {
        StandardDirectory.DOCUMENTS -> getPublicDirectory(Environment.DIRECTORY_DOCUMENTS)
        StandardDirectory.DOWNLOADS -> getPublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        StandardDirectory.PICTURES -> getPublicDirectory(Environment.DIRECTORY_PICTURES)
        StandardDirectory.VIDEOS -> getPublicDirectory(Environment.DIRECTORY_MOVIES)
        StandardDirectory.MUSIC -> getPublicDirectory(Environment.DIRECTORY_MUSIC)
        StandardDirectory.MOVIES -> getPublicDirectory(Environment.DIRECTORY_MOVIES)
        StandardDirectory.PHONE_STORAGE -> getPhoneStorageRoot()
        StandardDirectory.SD_CARD -> getSDCardPath()
      }
      directoryUri
    }

    AsyncFunction("generateThumbnailJpeg") { fileUri: String ->
      try {
        val uri = Uri.parse(fileUri)
        val file = File(uri.path ?: throw IllegalArgumentException("Invalid file path"))
        if (!file.exists()) throw IllegalArgumentException("File does not exist: ${file.absolutePath}")
        val thumbnailSize = Size(256, 256)
        val mimeType = getMimeType(file.absolutePath)
        val thumbnail: Bitmap = when {
          mimeType?.startsWith("image/") == true -> ThumbnailUtils.createImageThumbnail(file, thumbnailSize, null)
          mimeType?.startsWith("video/") == true -> ThumbnailUtils.createVideoThumbnail(file, thumbnailSize, null)
          else -> throw IllegalArgumentException("Unsupported file type: $mimeType")
        }
        val outputStream = ByteArrayOutputStream()
        thumbnail.compress(Bitmap.CompressFormat.JPEG, 80, outputStream)
        val jpegData = outputStream.toByteArray()
        outputStream.close()
        thumbnail.recycle()
        return@AsyncFunction jpegData
      } catch (e: Exception) {
        throw Exception("Failed to generate thumbnail: ${e.message}", e)
      }
    }

    // TCP Client functions - improved
    AsyncFunction("tcpConnect") { host: String, port: Int ->
      val connectionId = "tcp_${connectionIdCounter.incrementAndGet()}"

      withContext(Dispatchers.IO) {
        try {
          val socketChannel = SocketChannel.open()
          socketChannel.configureBlocking(false)

          val address = InetSocketAddress(host, port)
          val initiated = socketChannel.connect(address)

          // Use selector manager to wait for connect if needed
          if (!initiated) {
            val success = selectorManager.awaitConnect(socketChannel, 10_000L)
            if (!success) {
              socketChannel.close()
              throw Exception("Connection timeout")
            }
            if (!socketChannel.finishConnect()) {
              socketChannel.close()
              throw Exception("Failed to finish connect")
            }
          }

          // Create a per-connection writer channel
          val writeChannel = Channel<ByteArray>(capacity = Channel.UNLIMITED)

          // Writer coroutine: single writer serializes writes
          val writerJob = moduleScope.launch(Dispatchers.IO) {
            try {
              while (isActive) {
                val data = writeChannel.receive()
                var buffer = ByteBuffer.wrap(data)
                while (buffer.hasRemaining()) {
                  val written = socketChannel.write(buffer)
                  if (written == 0) {
                    // wait until writable
                    selectorManager.awaitWritable(socketChannel)
                  }
                }
              }
            } catch (e: ClosedReceiveChannelException) {
              // channel closed, exit
            } catch (e: CancellationException) {
              // coroutine cancelled
            } catch (e: Exception) {
              sendEvent("tcpError", mapOf("connectionId" to connectionId, "error" to e.message))
            }
          }

          // Reader coroutine: suspended by selector manager when no data
          val readerJob = moduleScope.launch(Dispatchers.IO) {
            val buffer = ByteBuffer.allocate(4096)
            try {
              while (isActive && socketChannel.isOpen && socketChannel.isConnected) {
                val readable = selectorManager.awaitReadable(socketChannel, 1000L)
                if (!readable) continue

                buffer.clear()
                val bytesRead = socketChannel.read(buffer)
                if (bytesRead > 0) {
                  buffer.flip()
                  val data = ByteArray(bytesRead)
                  buffer.get(data)
                  sendEvent("tcpData", mapOf("connectionId" to connectionId, "data" to data))
                } else if (bytesRead == -1) {
                  // remote closed
                  break
                }
              }
            } catch (e: CancellationException) {
              // cancelled
            } catch (e: Exception) {
              sendEvent("tcpError", mapOf("connectionId" to connectionId, "error" to e.message))
            } finally {
              sendEvent("tcpClose", mapOf("connectionId" to connectionId))
              try { socketChannel.close() } catch (_: Exception) {}
              tcpConnections.remove(connectionId)
            }
          }

          val connection = TcpConnection(socketChannel, writeChannel, readerJob, writerJob)
          tcpConnections[connectionId] = connection

          return@withContext connectionId
        } catch (e: Exception) {
          throw Exception("Failed to connect: ${e.message}", e)
        }
      }
    }

    AsyncFunction("tcpSend") { connectionId: String, data: ByteArray ->
      withContext(Dispatchers.IO) {
        try {
          val connection = tcpConnections[connectionId]
            ?: throw IllegalArgumentException("Connection not found: $connectionId")

          // Send to writer channel (serializes writes)
          connection.writer.send(data)

          return@withContext true
        } catch (e: Exception) {
          throw Exception("Failed to send data: ${e.message}", e)
        }
      }
    }

    AsyncFunction("tcpClose") { connectionId: String ->
      try {
        val connection = tcpConnections[connectionId]
          ?: throw IllegalArgumentException("Connection not found: $connectionId")

        connection.readerJob.cancel()
        connection.writer.close()
        connection.writerJob.cancel()
        try { connection.socketChannel.close() } catch (_: Exception) {}
        tcpConnections.remove(connectionId)

        return@AsyncFunction true
      } catch (e: Exception) {
        throw Exception("Failed to close connection: ${e.message}", e)
      }
    }

    // UDP functions left similar but run in moduleScope (better than GlobalScope)
    AsyncFunction("udpCreateSocket") {
      val socketId = "udp_${socketIdCounter.incrementAndGet()}"
      return@AsyncFunction socketId
    }

    AsyncFunction("udpBind") { socketId: String, port: Int?, address: String? ->
      try {
        val bindPort = port ?: 0
        val bindAddress = address ?: "0.0.0.0"

        val socket = DatagramSocket()
        val inetAddress = if (bindAddress == "0.0.0.0") null else InetAddress.getByName(bindAddress)
        socket.bind(InetSocketAddress(inetAddress, bindPort))

        val actualAddress = socket.localAddress?.hostAddress ?: "127.0.0.1"
        val actualPort = socket.localPort

        val job = moduleScope.launch(Dispatchers.IO) {
          try {
            val buffer = ByteArray(65507)
            while (!socket.isClosed && isActive) {
              val packet = DatagramPacket(buffer, buffer.size)
              socket.receive(packet)
              val data = packet.data.copyOfRange(0, packet.length)
              sendEvent("udpMessage", mapOf(
                "socketId" to socketId,
                "data" to data,
                "address" to packet.address.hostAddress,
                "port" to packet.port
              ))
            }
          } catch (e: Exception) {
            if (!socket.isClosed) sendEvent("udpError", mapOf("socketId" to socketId, "error" to e.message))
          } finally {
            sendEvent("udpClose", mapOf("socketId" to socketId))
            udpSockets.remove(socketId)
          }
        }

        val udpSocket = UdpSocket(socket, job, socketId)
        udpSockets[socketId] = udpSocket

        sendEvent("udpListening", mapOf("socketId" to socketId, "address" to actualAddress, "port" to actualPort))

        return@AsyncFunction mapOf("address" to actualAddress, "port" to actualPort)
      } catch (e: Exception) {
        throw Exception("Failed to bind UDP socket: ${e.message}", e)
      }
    }

    AsyncFunction("udpSend") { socketId: String, data: ByteArray, port: Int, address: String ->
      try {
        val socket = udpSockets[socketId]?.socket ?: throw IllegalArgumentException("Socket not found: $socketId")
        val inetAddress = InetAddress.getByName(address)
        val packet = DatagramPacket(data, data.size, inetAddress, port)
        socket.send(packet)
        return@AsyncFunction true
      } catch (e: Exception) {
        throw Exception("Failed to send UDP data: ${e.message}", e)
      }
    }

    AsyncFunction("udpClose") { socketId: String ->
      try {
        val udpSocket = udpSockets[socketId] ?: throw IllegalArgumentException("Socket not found: $socketId")
        udpSocket.job.cancel()
        udpSocket.socket.close()
        udpSockets.remove(socketId)
        return@AsyncFunction true
      } catch (e: Exception) {
        throw Exception("Failed to close UDP socket: ${e.message}", e)
      }
    }

    Events("tcpData", "tcpError", "tcpClose", "udpMessage", "udpError", "udpListening", "udpClose")
  }

  // SelectorManager: single selector thread that handles readiness and allows coroutines to await events
  private class SelectorManager {
    private val selector: Selector = Selector.open()
    private val registerQueue = ConcurrentLinkedQueue<() -> Unit>()
    private val wakeupLock = Object()

    // Maps for awaiting continuations
    private val connectWaiters = ConcurrentHashMap<SocketChannel, CompletableDeferred<Boolean>>()
    private val readWaiters = ConcurrentHashMap<SocketChannel, CompletableDeferred<Boolean>>()
    private val writeWaiters = ConcurrentHashMap<SocketChannel, CompletableDeferred<Unit>>()

    init {
      Thread({ runLoop() }, "Superman-Selector").apply { isDaemon = true }.start()
    }

    private fun runLoop() {
      try {
        while (true) {
          // drain register queue
          var task = registerQueue.poll()
          while (task != null) {
            try { task() } catch (_: Exception) {}
            task = registerQueue.poll()
          }

          val ready = selector.select(500)
          if (ready > 0) {
            val iter = selector.selectedKeys().iterator()
            while (iter.hasNext()) {
              val key = iter.next()
              iter.remove()
              val channel = key.channel() as? SocketChannel ?: continue

              try {
                if (key.isConnectable) {
                  // complete connect waiter
                  connectWaiters.remove(channel)?.complete(true)
                }
                if (key.isReadable) {
                  readWaiters.remove(channel)?.complete(true)
                }
                if (key.isWritable) {
                  writeWaiters.remove(channel)?.complete(Unit)
                }
              } catch (e: Exception) {
                // best effort
              }
            }
          }
        }
      } catch (e: Exception) {
        // fatal selector error
      } finally {
        try { selector.close() } catch (_: Exception) {}
      }
    }

    private fun enqueue(reg: () -> Unit) {
      registerQueue.add(reg)
      // wake up selector
      try {
        selector.wakeup()
      } catch (_: Exception) {}
    }

    suspend fun awaitConnect(channel: SocketChannel, timeoutMs: Long): Boolean {
      val deferred = CompletableDeferred<Boolean>()
      connectWaiters[channel] = deferred
      enqueue {
        try {
          channel.register(selector, SelectionKey.OP_CONNECT)
        } catch (e: Exception) { deferred.completeExceptionally(e) }
      }
      return try {
        withTimeout(timeoutMs) { deferred.await() }
      } catch (e: TimeoutCancellationException) {
        connectWaiters.remove(channel)
        false
      }
    }

    suspend fun awaitReadable(channel: SocketChannel, timeoutMs: Long): Boolean {
      // short-circuit if already closed
      if (!channel.isOpen) return false
      val deferred = CompletableDeferred<Boolean>()
      readWaiters[channel] = deferred
      enqueue {
        try {
          val key = channel.keyFor(selector)
          if (key == null) channel.register(selector, SelectionKey.OP_READ) else key.interestOps(key.interestOps() or SelectionKey.OP_READ)
        } catch (e: Exception) { deferred.completeExceptionally(e) }
      }

      return try {
        withTimeout(timeoutMs) { deferred.await() }
      } catch (e: TimeoutCancellationException) {
        readWaiters.remove(channel)
        false
      }
    }

    suspend fun awaitWritable(channel: SocketChannel) {
      if (!channel.isOpen) throw CancellationException("Channel closed")
      val deferred = CompletableDeferred<Unit>()
      writeWaiters[channel] = deferred
      enqueue {
        try {
          val key = channel.keyFor(selector)
          if (key == null) channel.register(selector, SelectionKey.OP_WRITE) else key.interestOps(key.interestOps() or SelectionKey.OP_WRITE)
        } catch (e: Exception) { deferred.completeExceptionally(e) }
      }
      deferred.await()
    }
  }
}
