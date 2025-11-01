import ExpoModulesCore
import UIKit
import Photos

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
    // For file:// URLs, use direct image loading for better compatibility
    var fileUrl = url
    if url.scheme == "file" {
      fileUrl = url
    } else if !url.isFileURL {
      fileUrl = URL(fileURLWithPath: url.path)
    }
    
    // Try to load image data directly (works better with iOS sandboxing)
    guard let imageData = try? Data(contentsOf: fileUrl),
          let image = UIImage(data: imageData) else {
      promise.reject("FILE_NOT_READABLE", "Cannot read image file at: \(fileUrl.path)")
      return
    }
    
    let targetSize = CGSize(width: 256, height: 256)
    
    // Calculate aspect-fit size
    let aspectRatio = image.size.width / image.size.height
    var thumbnailSize = targetSize
    
    if aspectRatio > 1 {
      thumbnailSize.height = targetSize.width / aspectRatio
    } else {
      thumbnailSize.width = targetSize.height * aspectRatio
    }
    
    // Generate thumbnail
    UIGraphicsBeginImageContextWithOptions(thumbnailSize, false, 1.0)
    image.draw(in: CGRect(origin: .zero, size: thumbnailSize))
    let thumbnailImage = UIGraphicsGetImageFromCurrentImageContext()
    UIGraphicsEndImageContext()
    
    guard let thumbnail = thumbnailImage,
          let jpegData = thumbnail.jpegData(compressionQuality: 0.8) else {
      promise.reject("JPEG_CONVERSION_FAILED", "Failed to convert thumbnail to JPEG data")
      return
    }
    
    promise.resolve(jpegData)
  }
}
