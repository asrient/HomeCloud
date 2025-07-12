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
  }
}
