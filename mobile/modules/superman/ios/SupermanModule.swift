import ExpoModulesCore
import QuickLookThumbnailing
import UIKit

public class SupermanModule: Module {
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  public func definition() -> ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('Superman')` in JavaScript.
    Name("Superman")

    // Defines a JavaScript synchronous function that runs the native code on the JavaScript thread.
    Function("hello") {
      return "Hello world! 👋"
    }

    // Defines a JavaScript function that always returns a Promise and whose native code
    // is by default dispatched on the different thread than the JavaScript runtime runs on.
    AsyncFunction("generateThumbnailJpeg") { (fileUri: String, promise: Promise) in
      // Parse the file URI to get the URL
      guard let url = URL(string: fileUri) else {
        promise.reject("INVALID_URI", "Invalid file URI provided")
        return
      }
      
      // Check if file exists
      guard FileManager.default.fileExists(atPath: url.path) else {
        promise.reject("FILE_NOT_FOUND", "File does not exist at path: \(url.path)")
        return
      }
      
      // Set up the parameters of the request
      let size: CGSize = CGSize(width: 256, height: 256)
      let scale = UIScreen.main.scale
      
      // Create the thumbnail request
      let request = QLThumbnailGenerator.Request(fileAt: url,
                                                 size: size,
                                                 scale: scale,
                                                 representationTypes: .thumbnail)
      
      // Retrieve the singleton instance of the thumbnail generator
      let generator = QLThumbnailGenerator.shared
      
      generator.generateRepresentations(for: request) { (thumbnail, type, error) in
        if let error = error {
          promise.reject("THUMBNAIL_GENERATION_FAILED", "Failed to generate thumbnail: \(error.localizedDescription)")
          return
        }
        
        guard let thumbnail = thumbnail else {
          promise.reject("THUMBNAIL_GENERATION_FAILED", "Thumbnail generation returned nil")
          return
        }
        
        // Convert the thumbnail image to JPEG data
        guard let jpegData = thumbnail.uiImage.jpegData(compressionQuality: 0.8) else {
          promise.reject("JPEG_CONVERSION_FAILED", "Failed to convert thumbnail to JPEG data")
          return
        }
        
        // Resolve the promise with the JPEG data
        promise.resolve(jpegData)
      }
    }
  }
}
