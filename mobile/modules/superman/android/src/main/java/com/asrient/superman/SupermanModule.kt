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


class SupermanModule : Module() {
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
    
    // Helper function to get MIME type
    private fun getMimeType(filePath: String): String? {
      val extension = filePath.substringAfterLast('.', "")
      return if (extension.isNotEmpty()) {
        MimeTypeMap.getSingleton().getMimeTypeFromExtension(extension.lowercase())
      } else {
        null
      }
    }
  }
}
