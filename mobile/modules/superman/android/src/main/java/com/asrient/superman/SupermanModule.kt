package com.asrient.superman

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import android.graphics.Bitmap
import android.media.MediaMetadataRetriever
import android.media.ThumbnailUtils
import android.net.Uri
import android.util.Size
import android.webkit.MimeTypeMap
import java.io.ByteArrayOutputStream
import java.io.File
import java.net.URL
import java.nio.ByteBuffer
import expo.modules.kotlin.types.Enumerable
import android.os.Environment
import android.content.Context
import android.os.Build
import android.os.storage.StorageManager
import androidx.core.content.ContextCompat
import java.net.Socket
import java.net.InetSocketAddress
import java.io.InputStream
import java.io.OutputStream
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.*
import expo.modules.kotlin.Promise
import java.nio.channels.SocketChannel
import java.nio.ByteBuffer
import java.nio.channels.SelectionKey
import java.nio.channels.Selector
import java.net.DatagramSocket
import java.net.DatagramPacket
import java.net.InetAddress
import java.net.InetSocketAddress

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
  
  data class TcpConnection(
    val socketChannel: SocketChannel,
    val job: Job
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

  // Helper function to get public directory
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

  // Helper function to get phone storage root
  private fun getPhoneStorageRoot(): String? {
    return try {
      // DIRECT METHOD: With MANAGE_EXTERNAL_STORAGE permission, this works on all Android versions
      @Suppress("DEPRECATION")
      Environment.getExternalStorageDirectory()?.let { Uri.fromFile(it).toString() }
    } catch (e: Exception) {
      null
    }
  }

  // Helper function to get SD card paths
  private fun getSDCardPath(): String? {
    return try {
      val context = getContext()
      
      // DIRECT METHOD: With MANAGE_EXTERNAL_STORAGE permission, use StorageManager
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
        val storageManager = context.getSystemService(Context.STORAGE_SERVICE) as StorageManager
        storageManager.storageVolumes.find { volume ->
          volume.isRemovable && !volume.isPrimary
        }?.directory?.let { sdPath ->
          Uri.fromFile(sdPath).toString()
        }
      } else {
        // For older Android versions, use the fallback method
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

  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  override fun definition() = ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('Superman')` in JavaScript.
    Name("Superman")

    // Defines a JavaScript synchronous function that runs the native code on the JavaScript thread.
    Function("hello") {
      "Hello world! 👋"
    }

    Function("getStandardDirectoryUri") { standardDirectory: StandardDirectory ->
      // Get the standard directory URI based on the provided enum value
      val directoryUri = when (standardDirectory) {
        StandardDirectory.DOCUMENTS -> {
          getPublicDirectory(Environment.DIRECTORY_DOCUMENTS)
        }
        StandardDirectory.DOWNLOADS -> {
          getPublicDirectory(Environment.DIRECTORY_DOWNLOADS)
        }
        StandardDirectory.PICTURES -> {
          getPublicDirectory(Environment.DIRECTORY_PICTURES)
        }
        StandardDirectory.VIDEOS -> {
          getPublicDirectory(Environment.DIRECTORY_MOVIES)
        }
        StandardDirectory.MUSIC -> {
          getPublicDirectory(Environment.DIRECTORY_MUSIC)
        }
        StandardDirectory.MOVIES -> {
          getPublicDirectory(Environment.DIRECTORY_MOVIES)
        }
        StandardDirectory.PHONE_STORAGE -> {
          getPhoneStorageRoot()
        }
        StandardDirectory.SD_CARD -> {
          getSDCardPath()
        }
      }
      directoryUri
    }

    // Defines a JavaScript function that always returns a Promise and whose native code
    // is by default dispatched on the different thread than the JavaScript runtime runs on.
    AsyncFunction("generateThumbnailJpeg") { fileUri: String ->
      try {
        // Parse the file URI
        val uri = Uri.parse(fileUri)
        val file = File(uri.path ?: throw IllegalArgumentException("Invalid file path"))
        
        // Check if file exists
        if (!file.exists()) {
          throw IllegalArgumentException("File does not exist: ${file.absolutePath}")
        }
        
        // Define thumbnail size (you can make this configurable)
        val thumbnailSize = Size(256, 256)
        
        // Determine MIME type
        val mimeType = getMimeType(file.absolutePath)
        
        // Generate thumbnail based on file type
        val thumbnail: Bitmap = when {
          mimeType?.startsWith("image/") == true -> {
            // Use ThumbnailUtils for images
            ThumbnailUtils.createImageThumbnail(file, thumbnailSize, null)
          }
          mimeType?.startsWith("video/") == true -> {
            // Use ThumbnailUtils for videos
            ThumbnailUtils.createVideoThumbnail(file, thumbnailSize, null)
          }
          else -> {
            throw IllegalArgumentException("Unsupported file type: $mimeType")
          }
        }
        
        // Convert bitmap to JPEG byte array
        val outputStream = ByteArrayOutputStream()
        thumbnail.compress(Bitmap.CompressFormat.JPEG, 80, outputStream)
        val jpegData = outputStream.toByteArray()
        
        // Clean up
        outputStream.close()
        thumbnail.recycle()
        
        return@AsyncFunction jpegData
      } catch (e: Exception) {
        throw Exception("Failed to generate thumbnail: ${e.message}", e)
      }
    }

    // TCP Client functions
    AsyncFunction("tcpConnect") { host: String, port: Int ->
      val connectionId = "tcp_${connectionIdCounter.incrementAndGet()}"
      
      // Run connection establishment on IO dispatcher to avoid blocking
      withContext(Dispatchers.IO) {
        try {
          val socketChannel = SocketChannel.open()
          socketChannel.configureBlocking(false)
          
          val address = InetSocketAddress(host, port)
          val connected = socketChannel.connect(address)
          
          if (!connected) {
            // Connection is in progress, wait for it to complete
            val selector = Selector.open()
            socketChannel.register(selector, SelectionKey.OP_CONNECT)
            
            val timeout = 10000L // 10 seconds
            val ready = selector.select(timeout)
            
            if (ready == 0) {
              socketChannel.close()
              selector.close()
              throw Exception("Connection timeout")
            }
            
            if (!socketChannel.finishConnect()) {
              socketChannel.close()
              selector.close()
              throw Exception("Failed to complete connection")
            }
            
            selector.close()
          }
          
          // Create a job for handling incoming data
          val job = CoroutineScope(Dispatchers.IO).launch {
            val buffer = ByteBuffer.allocate(4096)
            val selector = Selector.open()
            socketChannel.register(selector, SelectionKey.OP_READ)
            
            try {
              while (socketChannel.isConnected && socketChannel.isOpen) {
                val ready = selector.select(1000) // 1 second timeout
                
                if (ready > 0) {
                  buffer.clear()
                  val bytesRead = socketChannel.read(buffer)
                  
                  if (bytesRead > 0) {
                    buffer.flip()
                    val data = ByteArray(bytesRead)
                    buffer.get(data)
                    
                    // Send event to JavaScript with received data
                    sendEvent("tcpData", mapOf(
                      "connectionId" to connectionId,
                      "data" to data
                    ))
                  } else if (bytesRead == -1) {
                    // End of stream
                    break
                  }
                }
              }
            } catch (e: Exception) {
              // Connection closed or error occurred
              sendEvent("tcpError", mapOf(
                "connectionId" to connectionId,
                "error" to e.message
              ))
            } finally {
              selector.close()
              sendEvent("tcpClose", mapOf(
                "connectionId" to connectionId
              ))
              tcpConnections.remove(connectionId)
            }
          }
          
          val connection = TcpConnection(socketChannel, job)
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
          
          val buffer = ByteBuffer.wrap(data)
          var totalWritten = 0
          
          while (buffer.hasRemaining()) {
            val written = connection.socketChannel.write(buffer)
            totalWritten += written
            
            if (written == 0) {
              // Socket buffer is full, wait a bit
              delay(10)
            }
          }
          
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
        
        connection.job.cancel()
        connection.socketChannel.close()
        tcpConnections.remove(connectionId)
        
        return@AsyncFunction true
      } catch (e: Exception) {
        throw Exception("Failed to close connection: ${e.message}", e)
      }
    }

    // UDP Socket functions
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
        
        val job = GlobalScope.launch(Dispatchers.IO) {
          try {
            val buffer = ByteArray(4096)
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
            if (!socket.isClosed) {
              sendEvent("udpError", mapOf(
                "socketId" to socketId,
                "error" to e.message
              ))
            }
          } finally {
            sendEvent("udpClose", mapOf("socketId" to socketId))
            udpSockets.remove(socketId)
          }
        }
        
        val udpSocket = UdpSocket(socket, job, socketId)
        udpSockets[socketId] = udpSocket
        
        sendEvent("udpListening", mapOf(
          "socketId" to socketId,
          "address" to actualAddress,
          "port" to actualPort
        ))
        
        return@AsyncFunction mapOf(
          "address" to actualAddress,
          "port" to actualPort
        )
      } catch (e: Exception) {
        throw Exception("Failed to bind UDP socket: ${e.message}", e)
      }
    }

    AsyncFunction("udpSend") { socketId: String, data: ByteArray, port: Int, address: String ->
      try {
        val socket = udpSockets[socketId]?.socket
          ?: throw IllegalArgumentException("Socket not found: $socketId")
        
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
        val udpSocket = udpSockets[socketId]
          ?: throw IllegalArgumentException("Socket not found: $socketId")
        
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
}
