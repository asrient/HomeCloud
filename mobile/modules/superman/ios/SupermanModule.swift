import ExpoModulesCore

public class SupermanModule: Module {
  // Networking components
  private let tcpNetworking = TcpNetworking()
  private let udpNetworking = UdpNetworking()
  private let thumbnailGenerator = ThumbnailGenerator()
  
  // Each module class must implement the definition function. The definition consists of components
  // that describes the module's functionality and behavior.
  // See https://docs.expo.dev/modules/module-api for more details about available components.
  public func definition() -> ModuleDefinition {
    // Sets the name of the module that JavaScript code will use to refer to the module. Takes a string as an argument.
    // Can be inferred from module's class name, but it's recommended to set it explicitly for clarity.
    // The module will be accessible from `requireNativeModule('Superman')` in JavaScript.
    Name("Superman")
    
    // Set up event closures for networking classes
    OnCreate {
      self.tcpNetworking.sendEvent = { [weak self] name, body in
        self?.sendEvent(name, body)
      }
      self.udpNetworking.sendEvent = { [weak self] name, body in
        self?.sendEvent(name, body)
      }
    }

    // Defines a JavaScript synchronous function that runs the native code on the JavaScript thread.
    Function("hello") {
      return "Hello world! 👋"
    }

    // Defines a JavaScript function that always returns a Promise and whose native code
    // is by default dispatched on the different thread than the JavaScript runtime runs on.
    AsyncFunction("generateThumbnailJpeg") { (fileUri: String, promise: Promise) in
      self.thumbnailGenerator.generateThumbnail(fileUri: fileUri, promise: promise)
    }

    // TCP Client functions
    AsyncFunction("tcpConnect") { (host: String, port: Int, promise: Promise) in
      self.tcpNetworking.connect(host: host, port: port, promise: promise)
    }

    AsyncFunction("tcpSend") { (connectionId: String, data: Data, promise: Promise) in
      self.tcpNetworking.send(connectionId: connectionId, data: data, promise: promise)
    }

    AsyncFunction("tcpClose") { (connectionId: String, promise: Promise) in
      self.tcpNetworking.close(connectionId: connectionId, promise: promise)
    }

    // TCP Server functions
    AsyncFunction("tcpStartServer") { (port: Int, promise: Promise) in
      self.tcpNetworking.startServer(port: port, promise: promise)
    }

    AsyncFunction("tcpStopServer") { (promise: Promise) in
      self.tcpNetworking.stopServer(promise: promise)
    }

    // UDP Socket functions
    AsyncFunction("udpCreateSocket") { (promise: Promise) in
      self.udpNetworking.createSocket(promise: promise)
    }

    AsyncFunction("udpBind") { (socketId: String, port: Int?, address: String?, promise: Promise) in
      self.udpNetworking.bind(socketId: socketId, port: port, address: address, promise: promise)
    }

    AsyncFunction("udpSend") { (socketId: String, data: Data, port: Int, address: String, promise: Promise) in
      self.udpNetworking.send(socketId: socketId, data: data, port: port, address: address, promise: promise)
    }

    AsyncFunction("udpClose") { (socketId: String, promise: Promise) in
      self.udpNetworking.close(socketId: socketId, promise: promise)
    }

    AsyncFunction("getDisks") { (promise: Promise) in
      DispatchQueue.global(qos: .userInitiated).async {
        var disks: [[String: Any]] = []
        
        // Get internal storage from root path
        let rootURL = URL(fileURLWithPath: "/")
        do {
          let resourceValues = try rootURL.resourceValues(forKeys: [
            .volumeNameKey,
            .volumeTotalCapacityKey,
            .volumeAvailableCapacityForImportantUsageKey
          ])
          
          if let totalCapacity = resourceValues.volumeTotalCapacity,
             let availableCapacity = resourceValues.volumeAvailableCapacityForImportantUsage {
            
            let volumeName = resourceValues.volumeName ?? "Internal Storage"
            
            let diskInfo: [String: Any] = [
              "type": "internal",
              "name": volumeName,
              "path": "/",
              "size": totalCapacity,
              "free": availableCapacity
            ]
            
            disks.append(diskInfo)
          }
        } catch {
          // If root query fails, still resolve with empty array
          print("Error retrieving disk info: \(error.localizedDescription)")
        }
        
        // Check for external storage (mounted volumes)
        let fileManager = FileManager.default
        if let urls = fileManager.mountedVolumeURLs(includingResourceValuesForKeys: [
          .volumeNameKey,
          .volumeTotalCapacityKey,
          .volumeAvailableCapacityForImportantUsageKey,
          .volumeIsRemovableKey
        ], options: [.skipHiddenVolumes]) {
          for url in urls {
            // Skip the root volume as we already added it
            if url.path == "/" {
              continue
            }
            
            do {
              let resourceValues = try url.resourceValues(forKeys: [
                .volumeNameKey,
                .volumeTotalCapacityKey,
                .volumeAvailableCapacityForImportantUsageKey,
                .volumeIsRemovableKey
              ])
              
              guard let totalCapacity = resourceValues.volumeTotalCapacity,
                    let availableCapacity = resourceValues.volumeAvailableCapacityForImportantUsage else {
                continue
              }
              
              let isRemovable = resourceValues.volumeIsRemovable ?? false
              let volumeName = resourceValues.volumeName ?? "External Storage"
              
              let diskInfo: [String: Any] = [
                "type": isRemovable ? "external" : "internal",
                "name": volumeName,
                "path": url.path,
                "size": totalCapacity,
                "free": availableCapacity
              ]
              
              disks.append(diskInfo)
            } catch {
              // Skip volumes that can't be read
              continue
            }
          }
        }
        
        promise.resolve(disks)
      }
    }

    // Storage permissions (Android-only, no-op on iOS)
    Function("hasAllFilesAccess") {
      return true
    }

    Function("requestAllFilesAccess") {
      return true
    }

    // Open file with system viewer (Android-only, iOS uses QuickLook via JS)
    AsyncFunction("openFile") { (filePath: String) in
      // No-op on iOS; file opening is handled via expo-quicklook-preview in JS
    }

    // Events
    Events("tcpData", "tcpError", "tcpClose", "tcpIncomingConnection", "udpMessage", "udpError", "udpListening", "udpClose")
  }
}
