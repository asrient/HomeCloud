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
import expo.modules.kotlin.types.Enumerable
import android.os.Environment
import android.content.Context
import android.os.Build
import android.os.storage.StorageManager
import androidx.core.content.ContextCompat
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.SendChannel
// Removed ClosedReceiveChannelException (unused)
import java.net.InetAddress
import io.ktor.network.sockets.*
import io.ktor.utils.io.*
import io.ktor.network.selector.SelectorManager
import io.ktor.utils.io.core.*

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

  // Coroutine scope for connection coroutines
  private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val ktorSelector = SelectorManager(Dispatchers.IO)

  data class TcpConnection(
    val socket: Socket,
    val readChannel: ByteReadChannel,
    val writeChannel: ByteWriteChannel,
    val readerJob: Job,
    val writerJob: Job,
    val writerQueue: SendChannel<ByteArray>
  )

  data class UdpSocket(
    val socket: BoundDatagramSocket,
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

    // TCP Client functions via Ktor (Promise bridging)
    AsyncFunction("tcpConnect") { host: String, port: Int, promise: expo.modules.kotlin.Promise ->
      val connectionId = "tcp_${connectionIdCounter.incrementAndGet()}"
      moduleScope.launch {
        try {
          val socket = aSocket(ktorSelector).tcp().connect(io.ktor.network.sockets.InetSocketAddress(host, port))
          val readChannel = socket.openReadChannel()
          val writeChannel = socket.openWriteChannel(autoFlush = true)
          val writerQueue = Channel<ByteArray>(Channel.UNLIMITED)

          val writerJob = launch {
            try {
              for (data in writerQueue) {
                writeChannel.writeFully(data, 0, data.size)
                writeChannel.flush()
              }
            } catch (e: kotlinx.coroutines.CancellationException) {
            } catch (e: Exception) {
              sendEvent("tcpError", mapOf("connectionId" to connectionId, "error" to e.message))
            }
          }

          val readerJob = launch {
            try {
              val buffer = ByteArray(4096)
              while (isActive && !readChannel.isClosedForRead) {
                val read = readChannel.readAvailable(buffer, 0, buffer.size)
                if (read > 0) {
                  val data = buffer.copyOfRange(0, read)
                  sendEvent("tcpData", mapOf("connectionId" to connectionId, "data" to data))
                } else if (read == -1) {
                  break
                } else {
                  delay(10)
                }
              }
            } catch (e: kotlinx.coroutines.CancellationException) {
            } catch (e: Exception) {
              sendEvent("tcpError", mapOf("connectionId" to connectionId, "error" to e.message))
            } finally {
              sendEvent("tcpClose", mapOf("connectionId" to connectionId))
              try { socket.close() } catch (_: Exception) {}
              tcpConnections.remove(connectionId)
            }
          }

          val connection = TcpConnection(socket, readChannel, writeChannel, readerJob, writerJob, writerQueue)
          tcpConnections[connectionId] = connection
          promise.resolve(connectionId)
        } catch (e: Exception) {
          promise.reject("TCP_CONNECT", e.message ?: "Unknown error", e)
        }
      }
    }

    AsyncFunction("tcpSend") { connectionId: String, data: ByteArray, promise: expo.modules.kotlin.Promise ->
      try {
        val connection = tcpConnections[connectionId] ?: throw IllegalArgumentException("Connection not found: $connectionId")
        val result = connection.writerQueue.trySend(data)
        if (!result.isSuccess) throw Exception("Writer queue closed")
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("TCP_SEND", e.message ?: "Unknown error", e)
      }
    }

    AsyncFunction("tcpClose") { connectionId: String, promise: expo.modules.kotlin.Promise ->
      try {
        val connection = tcpConnections[connectionId] ?: throw IllegalArgumentException("Connection not found: $connectionId")
        connection.readerJob.cancel()
        connection.writerQueue.close()
        connection.writerJob.cancel()
        try { connection.socket.close() } catch (_: Exception) {}
        tcpConnections.remove(connectionId)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("TCP_CLOSE", e.message ?: "Unknown error", e)
      }
    }

    // UDP functions using Ktor
    AsyncFunction("udpCreateSocket") {
      val socketId = "udp_${socketIdCounter.incrementAndGet()}"
      socketId
    }

    AsyncFunction("udpBind") { socketId: String, port: Int?, address: String?, promise: expo.modules.kotlin.Promise ->
      moduleScope.launch {
        try {
          val bindPort = port ?: 0
          val bindAddress = address ?: "0.0.0.0"
          val bound = aSocket(ktorSelector).udp().bind(io.ktor.network.sockets.InetSocketAddress(bindAddress, bindPort))
          val actualAddress = (bound.localAddress as? io.ktor.network.sockets.InetSocketAddress)?.hostname ?: bindAddress
          val actualPort = (bound.localAddress as? io.ktor.network.sockets.InetSocketAddress)?.port ?: bindPort

          val job = launch {
            try {
              while (isActive) {
                val datagram = bound.receive()
                val packetAddress = datagram.address as? io.ktor.network.sockets.InetSocketAddress
                val data = datagram.packet.readBytes()
                sendEvent("udpMessage", mapOf(
                  "socketId" to socketId,
                  "data" to data,
                  "address" to (packetAddress?.hostname ?: ""),
                  "port" to (packetAddress?.port ?: 0)
                ))
              }
            } catch (e: kotlinx.coroutines.CancellationException) {
            } catch (e: Exception) {
              sendEvent("udpError", mapOf("socketId" to socketId, "error" to e.message))
            } finally {
              sendEvent("udpClose", mapOf("socketId" to socketId))
              udpSockets.remove(socketId)
              try { bound.close() } catch (_: Exception) {}
            }
          }

          val udpSocket = UdpSocket(bound, job, socketId)
          udpSockets[socketId] = udpSocket
          sendEvent("udpListening", mapOf("socketId" to socketId, "address" to actualAddress, "port" to actualPort))
          promise.resolve(mapOf("address" to actualAddress, "port" to actualPort))
        } catch (e: Exception) {
          promise.reject("UDP_BIND", e.message ?: "Unknown error", e)
        }
      }
    }

    AsyncFunction("udpSend") { socketId: String, data: ByteArray, port: Int, address: String, promise: expo.modules.kotlin.Promise ->
      moduleScope.launch {
        try {
          val s = udpSockets[socketId]?.socket ?: throw IllegalArgumentException("Socket not found: $socketId")
          val targetAddress = io.ktor.network.sockets.InetSocketAddress(address, port)
          val datagram = Datagram(ByteReadPacket(data), targetAddress)
          s.send(datagram)
          promise.resolve(true)
        } catch (e: Exception) {
          promise.reject("UDP_SEND", e.message ?: "Unknown error", e)
        }
      }
    }

    AsyncFunction("udpClose") { socketId: String, promise: expo.modules.kotlin.Promise ->
      try {
        val udpSocket = udpSockets[socketId] ?: throw IllegalArgumentException("Socket not found: $socketId")
        udpSocket.job.cancel()
        try { udpSocket.socket.close() } catch (_: Exception) {}
        udpSockets.remove(socketId)
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("UDP_CLOSE", e.message ?: "Unknown error", e)
      }
    }

    Events("tcpData", "tcpError", "tcpClose", "udpMessage", "udpError", "udpListening", "udpClose")
  }

}
