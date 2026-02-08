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
import androidx.core.content.FileProvider
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.*
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.channels.SendChannel
import java.net.InetAddress
import io.ktor.network.sockets.*
import io.ktor.utils.io.*
import io.ktor.network.selector.SelectorManager
import io.ktor.utils.io.core.*
import android.os.StatFs
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner

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

class SupermanModule : Module(), LifecycleEventObserver {
  // TCP connection management
  private val tcpConnections = ConcurrentHashMap<String, TcpConnection>()
  private val connectionIdCounter = java.util.concurrent.atomic.AtomicInteger(0)

  // TCP server management
  private var tcpServer: TcpServer? = null
  private var wasServerRunning = false
  private var lastServerPort = 0

  // UDP socket management
  private val udpSockets = ConcurrentHashMap<String, UdpSocket>()
  private val socketIdCounter = java.util.concurrent.atomic.AtomicInteger(0)

  // Coroutine scope for connection coroutines
  private val moduleScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val ktorSelector = SelectorManager(Dispatchers.IO)
  
  // Lifecycle observer registration flag
  private var lifecycleObserverRegistered = false

  data class TcpConnection(
    val socket: Socket,
    val readChannel: ByteReadChannel,
    val writeChannel: ByteWriteChannel,
    val readerJob: Job,
    val writerJob: Job,
    val writerQueue: SendChannel<ByteArray>,
    val isIncoming: Boolean = false
  )

  data class TcpServer(
    val serverSocket: ServerSocket,
    val acceptJob: Job,
    val port: Int
  )

  data class UdpSocket(
    val socket: BoundDatagramSocket,
    val job: Job,
    val socketId: String
  )

  // MARK: - Lifecycle Management
  
  override fun onStateChanged(source: LifecycleOwner, event: Lifecycle.Event) {
    when (event) {
      Lifecycle.Event.ON_STOP -> handleEnterBackground()
      Lifecycle.Event.ON_START -> handleEnterForeground()
      else -> {}
    }
  }
  
  private fun registerLifecycleObserver() {
    if (!lifecycleObserverRegistered) {
      try {
        android.os.Handler(android.os.Looper.getMainLooper()).post {
          ProcessLifecycleOwner.get().lifecycle.addObserver(this)
          lifecycleObserverRegistered = true
          android.util.Log.d("SupermanModule", "Lifecycle observer registered")
        }
      } catch (e: Exception) {
        android.util.Log.e("SupermanModule", "Failed to register lifecycle observer: ${e.message}")
      }
    }
  }
  
  private fun handleEnterBackground() {
    // Remember if server was running
    wasServerRunning = tcpServer != null
    if (wasServerRunning) {
      lastServerPort = tcpServer?.port ?: 0
    }
    android.util.Log.d("SupermanModule", "Entering background, server was running: $wasServerRunning")
  }
  
  private fun handleEnterForeground() {
    android.util.Log.d("SupermanModule", "Entering foreground...")
    
    moduleScope.launch {
      // Auto-restart server if it was running
      if (wasServerRunning && lastServerPort > 0) {
        android.util.Log.d("SupermanModule", "Checking if server needs restart on port $lastServerPort")
        restartServer(lastServerPort)
      }
    }
  }
  
  private suspend fun restartServer(port: Int) {
    // Check if server is still running
    tcpServer?.let { existingServer ->
      if (existingServer.acceptJob.isActive && !existingServer.serverSocket.isClosed) {
        android.util.Log.d("SupermanModule", "Server is still running, skipping restart")
        return
      }
      // Server is in a bad state, clean it up
      existingServer.acceptJob.cancel()
      try { existingServer.serverSocket.close() } catch (_: Exception) {}
      tcpServer = null
    }
    
    try {
      val serverSocket = aSocket(ktorSelector).tcp().bind(
        io.ktor.network.sockets.InetSocketAddress("0.0.0.0", port)
      )
      val actualPort = (serverSocket.localAddress as? io.ktor.network.sockets.InetSocketAddress)?.port ?: port
      android.util.Log.d("SupermanModule", "TCP server auto-restarted on port $actualPort")

      val acceptJob = moduleScope.launch {
        try {
          while (isActive) {
            val clientSocket = serverSocket.accept()
            handleIncomingConnection(clientSocket)
          }
        } catch (e: kotlinx.coroutines.CancellationException) {
          android.util.Log.d("SupermanModule", "TCP server accept loop cancelled")
        } catch (e: Exception) {
          android.util.Log.e("SupermanModule", "TCP server accept error: ${e.message}", e)
        } finally {
          try { serverSocket.close() } catch (_: Exception) {}
          tcpServer = null
        }
      }

      tcpServer = TcpServer(serverSocket, acceptJob, actualPort)
    } catch (e: Exception) {
      android.util.Log.e("SupermanModule", "Failed to auto-restart TCP server on port $port: ${e.message}", e)
      wasServerRunning = false
    }
  }

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
      val context = getContext()
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        val storageManager = context.getSystemService(Context.STORAGE_SERVICE) as StorageManager
        storageManager.storageVolumes.find { it.isPrimary }?.directory?.let {
          Uri.fromFile(it).toString()
        }
      } else {
        @Suppress("DEPRECATION")
        Environment.getExternalStorageDirectory()?.let { Uri.fromFile(it).toString() }
      }
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

    OnCreate {
      registerLifecycleObserver()
    }

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
          android.util.Log.d("SupermanModule", "Attempting TCP connection to $host:$port")
          val socket = aSocket(ktorSelector).tcp().connect(
            io.ktor.network.sockets.InetSocketAddress(host, port)
          ) {
            socketTimeout = 30000L // 30 second timeout
          }
          android.util.Log.d("SupermanModule", "TCP connection established: $connectionId")
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
              android.util.Log.e("SupermanModule", "TCP write error: ${e.message}", e)
              // Only send events if we successfully remove (prevents duplicates)
              if (tcpConnections.remove(connectionId) != null) {
                sendEvent("tcpError", mapOf("connectionId" to connectionId, "error" to (e.message ?: "Unknown error")))
                sendEvent("tcpClose", mapOf("connectionId" to connectionId))
              }
              try { socket.close() } catch (_: Exception) {}
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
              android.util.Log.e("SupermanModule", "TCP read error: ${e.message}", e)
              // Error event only if connection still exists
              if (tcpConnections.containsKey(connectionId)) {
                sendEvent("tcpError", mapOf("connectionId" to connectionId, "error" to (e.message ?: "Unknown error")))
              }
            } finally {
              // Only send close if we successfully remove (prevents duplicates)
              if (tcpConnections.remove(connectionId) != null) {
                sendEvent("tcpClose", mapOf("connectionId" to connectionId))
              }
              try { socket.close() } catch (_: Exception) {}
            }
          }

          val connection = TcpConnection(socket, readChannel, writeChannel, readerJob, writerJob, writerQueue, isIncoming = false)
          tcpConnections[connectionId] = connection
          promise.resolve(connectionId)
        } catch (e: Exception) {
          android.util.Log.e("SupermanModule", "TCP connection failed to $host:$port - ${e.message}", e)
          promise.reject("TCP_CONNECT", e.message ?: "Unknown error", e)
        }
      }
    }

    AsyncFunction("tcpSend") { connectionId: String, data: ByteArray, promise: expo.modules.kotlin.Promise ->
      try {
        val connection = tcpConnections[connectionId]
        if (connection == null) {
          // Connection not found - it was closed, resolve with false
          promise.resolve(false)
          return@AsyncFunction
        }
        // Check if connection is still valid
        if (connection.socket.isClosed || connection.writerJob.isCancelled) {
          tcpConnections.remove(connectionId)
          promise.resolve(false)
          return@AsyncFunction
        }
        val result = connection.writerQueue.trySend(data)
        if (!result.isSuccess) {
          // Queue closed, connection is dead
          promise.resolve(false)
          return@AsyncFunction
        }
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("TCP_SEND", e.message ?: "Unknown error", e)
      }
    }

    AsyncFunction("tcpClose") { connectionId: String, promise: expo.modules.kotlin.Promise ->
      try {
        val connection = tcpConnections[connectionId]
        if (connection == null) {
          // Connection not found - already closed, that's fine
          promise.resolve(true)
          return@AsyncFunction
        }
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

    // TCP Server functions
    AsyncFunction("tcpStartServer") { port: Int, promise: expo.modules.kotlin.Promise ->
      moduleScope.launch {
        try {
          // Stop existing server if any
          tcpServer?.let { server ->
            server.acceptJob.cancel()
            try { server.serverSocket.close() } catch (_: Exception) {}
          }
          tcpServer = null

          val serverSocket = aSocket(ktorSelector).tcp().bind(
            io.ktor.network.sockets.InetSocketAddress("0.0.0.0", port)
          )
          val actualPort = (serverSocket.localAddress as? io.ktor.network.sockets.InetSocketAddress)?.port ?: port
          android.util.Log.d("SupermanModule", "TCP server started on port $actualPort")

          val acceptJob = launch {
            try {
              while (isActive) {
                val clientSocket = serverSocket.accept()
                handleIncomingConnection(clientSocket)
              }
            } catch (e: kotlinx.coroutines.CancellationException) {
              android.util.Log.d("SupermanModule", "TCP server accept loop cancelled")
            } catch (e: Exception) {
              android.util.Log.e("SupermanModule", "TCP server accept error: ${e.message}", e)
            } finally {
              try { serverSocket.close() } catch (_: Exception) {}
              tcpServer = null
            }
          }

          tcpServer = TcpServer(serverSocket, acceptJob, actualPort)
          promise.resolve(mapOf("port" to actualPort))
        } catch (e: Exception) {
          android.util.Log.e("SupermanModule", "Failed to start TCP server on port $port: ${e.message}", e)
          promise.reject("TCP_SERVER", e.message ?: "Unknown error", e)
        }
      }
    }

    AsyncFunction("tcpStopServer") { promise: expo.modules.kotlin.Promise ->
      try {
        tcpServer?.let { server ->
          server.acceptJob.cancel()
          try { server.serverSocket.close() } catch (_: Exception) {}
        }
        tcpServer = null
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("TCP_STOP_SERVER", e.message ?: "Unknown error", e)
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
              sendEvent("udpError", mapOf("socketId" to socketId, "error" to (e.message ?: "Unknown error")))
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
        val udpSocket = udpSockets.remove(socketId)
        if (udpSocket != null) {
          udpSocket.job.cancel()
          try { udpSocket.socket.close() } catch (_: Exception) {}
        }
        // Always resolve true - already closed is fine
        promise.resolve(true)
      } catch (e: Exception) {
        promise.reject("UDP_CLOSE", e.message ?: "Unknown error", e)
      }
    }

    AsyncFunction("getDisks") {
      val disks = mutableListOf<Map<String, Any>>()
      val context = getContext()

      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
          val storageManager = context.getSystemService(Context.STORAGE_SERVICE) as StorageManager
          for (volume in storageManager.storageVolumes) {
            val dir = volume.directory ?: continue
            if (!dir.exists()) continue
            try {
              val stat = StatFs(dir.path)
              val type = if (volume.isPrimary) "internal" else "external"
              val name = if (volume.isPrimary) "Internal Storage" else (volume.getDescription(context) ?: "SD Card")
              disks.add(mapOf(
                "type" to type,
                "name" to name,
                "path" to Uri.fromFile(dir).toString(),
                "size" to (stat.blockCountLong * stat.blockSizeLong),
                "free" to (stat.availableBlocksLong * stat.blockSizeLong)
              ))
            } catch (e: Exception) {
              android.util.Log.e("SupermanModule", "Failed to read stats for ${dir.path}: ${e.message}")
            }
          }
        } else {
          @Suppress("DEPRECATION")
          val dir = Environment.getExternalStorageDirectory()
          if (dir != null && dir.exists()) {
            try {
              val stat = StatFs(dir.path)
              disks.add(mapOf(
                "type" to "internal",
                "name" to "Internal Storage",
                "path" to Uri.fromFile(dir).toString(),
                "size" to (stat.blockCountLong * stat.blockSizeLong),
                "free" to (stat.availableBlocksLong * stat.blockSizeLong)
              ))
            } catch (e: Exception) {
              android.util.Log.e("SupermanModule", "Failed to read stats for ${dir.path}: ${e.message}")
            }
          }
        }
      } catch (e: Exception) {
        android.util.Log.e("SupermanModule", "Error getting disks: ${e.message}", e)
      }

      return@AsyncFunction disks
    }

    Function("hasAllFilesAccess") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        Environment.isExternalStorageManager()
      } else {
        true
      }
    }

    Function("requestAllFilesAccess") {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R && !Environment.isExternalStorageManager()) {
        try {
          val context = getContext()
          val intent = android.content.Intent(
            android.provider.Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION,
            Uri.parse("package:${context.packageName}")
          )
          intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
          context.startActivity(intent)
          true
        } catch (e: Exception) {
          try {
            val intent = android.content.Intent(android.provider.Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION)
            intent.addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
            getContext().startActivity(intent)
            true
          } catch (_: Exception) {
            false
          }
        }
      } else {
        true
      }
    }

    AsyncFunction("openFile") { filePath: String ->
      val context = getContext()
      val uri = Uri.parse(filePath)
      val file = File(uri.path ?: throw IllegalArgumentException("Invalid file path"))
      if (!file.exists()) throw IllegalArgumentException("File not found: ${file.absolutePath}")

      val contentUri = FileProvider.getUriForFile(
        context,
        "${context.packageName}.superman.provider",
        file
      )
      val mimeType = MimeTypeMap.getSingleton()
        .getMimeTypeFromExtension(file.extension)
        ?: "application/octet-stream"

      val intent = android.content.Intent(android.content.Intent.ACTION_VIEW).apply {
        setDataAndType(contentUri, mimeType)
        addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION)
        addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)
      }
      context.startActivity(intent)
    }

    Events("tcpData", "tcpError", "tcpClose", "tcpIncomingConnection", "udpMessage", "udpError", "udpListening", "udpClose")
  }

  // Handle incoming TCP connections from the server
  private fun handleIncomingConnection(socket: Socket) {
    val connectionId = "tcp_${connectionIdCounter.incrementAndGet()}"
    android.util.Log.d("SupermanModule", "Incoming TCP connection: $connectionId")

    moduleScope.launch {
      try {
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
            android.util.Log.e("SupermanModule", "TCP write error (incoming): ${e.message}", e)
            // Only send events if we successfully remove (prevents duplicates)
            if (tcpConnections.remove(connectionId) != null) {
              sendEvent("tcpError", mapOf("connectionId" to connectionId, "error" to (e.message ?: "Unknown error")))
              sendEvent("tcpClose", mapOf("connectionId" to connectionId))
            }
            try { socket.close() } catch (_: Exception) {}
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
            android.util.Log.e("SupermanModule", "TCP read error (incoming): ${e.message}", e)
            // Error event only if connection still exists
            if (tcpConnections.containsKey(connectionId)) {
              sendEvent("tcpError", mapOf("connectionId" to connectionId, "error" to (e.message ?: "Unknown error")))
            }
          } finally {
            // Only send close if we successfully remove (prevents duplicates)
            if (tcpConnections.remove(connectionId) != null) {
              sendEvent("tcpClose", mapOf("connectionId" to connectionId))
            }
            try { socket.close() } catch (_: Exception) {}
          }
        }

        val connection = TcpConnection(socket, readChannel, writeChannel, readerJob, writerJob, writerQueue, isIncoming = true)
        tcpConnections[connectionId] = connection

        // Notify JS about the new incoming connection
        sendEvent("tcpIncomingConnection", mapOf("connectionId" to connectionId))
      } catch (e: Exception) {
        android.util.Log.e("SupermanModule", "Failed to setup incoming connection: ${e.message}", e)
        try { socket.close() } catch (_: Exception) {}
      }
    }
  }
}
