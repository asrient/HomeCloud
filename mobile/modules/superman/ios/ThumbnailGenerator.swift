import ExpoModulesCore
import UIKit
import Photos
import QuickLookThumbnailing

class ThumbnailGenerator {
  
  // MARK: - Public Methods
  
  func generateThumbnail(fileUri: String, promise: Promise) {
    // Parse the file URI to get the URL
    guard let url = URL(string: fileUri) else {
      promise.reject("INVALID_URI", "Invalid file URI provided")
      return
    }
    
    // Handle Photos library assets (ph://)
    if url.scheme == "ph" {
      generatePhotoThumbnail(url: url, promise: promise)
      return
    }
    
    // Handle file system files (file://)
    generateFileThumbnail(url: url, promise: promise)
  }
  
  // MARK: - Private Methods
  
  private func generatePhotoThumbnail(url: URL, promise: Promise) {
    // Extract asset ID from ph:// URL
    // Format: ph://asset-id or ph://asset-id/L0/001
    let assetId = url.host ?? url.pathComponents.first?.replacingOccurrences(of: "/", with: "") ?? ""
    
    guard !assetId.isEmpty else {
      promise.reject("INVALID_PHOTO_URI", "Could not extract asset ID from URL")
      return
    }
    
    // Fetch the asset
    let fetchResult = PHAsset.fetchAssets(withLocalIdentifiers: [assetId], options: nil)
    
    guard let asset = fetchResult.firstObject else {
      promise.reject("ASSET_NOT_FOUND", "Photo asset not found")
      return
    }
    
    // Request thumbnail
    let imageManager = PHImageManager.default()
    let targetSize = CGSize(width: 256, height: 256)
    
    let options = PHImageRequestOptions()
    options.deliveryMode = .highQualityFormat
    options.resizeMode = .exact
    options.isNetworkAccessAllowed = true
    options.isSynchronous = false
    
    imageManager.requestImage(for: asset, targetSize: targetSize, contentMode: .aspectFill, options: options) { image, info in
      guard let image = image else {
        promise.reject("THUMBNAIL_GENERATION_FAILED", "Failed to generate thumbnail from photo asset")
        return
      }
      
      guard let jpegData = image.jpegData(compressionQuality: 0.8) else {
        promise.reject("JPEG_CONVERSION_FAILED", "Failed to convert thumbnail to JPEG data")
        return
      }
      
      promise.resolve(jpegData)
    }
  }
  
  private func generateFileThumbnail(url: URL, promise: Promise) {
    // For file:// URLs, use direct path
    var fileUrl = url
    if url.scheme == "file" {
      fileUrl = url
    } else if !url.isFileURL {
      fileUrl = URL(fileURLWithPath: url.path)
    }
    
    // Check if file exists
    guard FileManager.default.fileExists(atPath: fileUrl.path) else {
      promise.reject("FILE_NOT_FOUND", "File not found at: \(fileUrl.path)")
      return
    }
    
    let targetSize = CGSize(width: 256, height: 256)
    let scale = UIScreen.main.scale
    
    // Create the thumbnail request
    let request = QLThumbnailGenerator.Request(
      fileAt: fileUrl,
      size: targetSize,
      scale: scale,
      representationTypes: .thumbnail
    )
    
    // Generate thumbnail using QLThumbnailGenerator
    QLThumbnailGenerator.shared.generateRepresentations(for: request) { (thumbnail, type, error) in
      if let error = error {
        promise.reject("THUMBNAIL_GENERATION_FAILED", "Failed to generate thumbnail: \(error.localizedDescription)")
        return
      }
      
      guard let thumbnail = thumbnail else {
        promise.reject("THUMBNAIL_GENERATION_FAILED", "Failed to generate thumbnail")
        return
      }
      
      guard let jpegData = thumbnail.uiImage.jpegData(compressionQuality: 0.8) else {
        promise.reject("JPEG_CONVERSION_FAILED", "Failed to convert thumbnail to JPEG data")
        return
      }
      
      promise.resolve(jpegData)
    }
  }
}
