import ExpoModulesCore
import QuickLookThumbnailing
import UIKit
import Network
import Photos

public class SupermanModule: Module {
  // TCP connection management
  private var tcpConnections: [String: TcpConnection] = [:]
  private var connectionIdCounter = 0
  private let networkQueue = DispatchQueue(label: "superman.network", qos: .userInitiated)
  
  // UDP socket management
  private var udpSockets: [String: UdpSocket] = [:]
  private var socketIdCounter = 0
  
  struct TcpConnection {
    let connection: NWConnection
    let connectionId: String
    var sendQueue: [Data] = []
    var isSending: Bool = false
  }
  
  struct UdpSocket {
    let listener: NWListener
    let socketId: String
    var receiveConnections: [String: NWConnection] = [:]
    var sendConnections: [String: NWConnection] = [:]
  }
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
      
      // Handle Photos library assets (ph://)
      if url.scheme == "ph" {
        self.generatePhotoThumbnail(url: url, promise: promise)
        return
      }
      
      // Handle file system files (file://)
      self.generateFileThumbnail(url: url, promise: promise)
    }

    // TCP Client functions
    AsyncFunction("tcpConnect") { (host: String, port: Int, promise: Promise) in
      self.networkQueue.async {
        self.connectionIdCounter += 1
        let connectionId = "tcp_\(self.connectionIdCounter)"
        
        let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(host), port: NWEndpoint.Port(integerLiteral: UInt16(port)))
        let connection = NWConnection(to: endpoint, using: .tcp)
        
        let tcpConnection = TcpConnection(connection: connection, connectionId: connectionId)
        self.tcpConnections[connectionId] = tcpConnection
        
        connection.stateUpdateHandler = { [weak self] state in
          switch state {
          case .ready:
            promise.resolve(connectionId)
            self?.startTcpReceiving(for: tcpConnection)
          case .failed(let error):
            self?.networkQueue.async {
              self?.tcpConnections.removeValue(forKey: connectionId)
            }
            promise.reject("TCP_CONNECT_FAILED", "Failed to connect: \(error.localizedDescription)")
          case .cancelled:
            self?.networkQueue.async {
              self?.tcpConnections.removeValue(forKey: connectionId)
            }
            self?.sendEvent("tcpClose", ["connectionId": connectionId])
          default:
            break
          }
        }
        
        connection.start(queue: self.networkQueue)
      }
    }

    AsyncFunction("tcpSend") { (connectionId: String, data: Data, promise: Promise) in
      self.networkQueue.async {
        guard var tcpConnection = self.tcpConnections[connectionId] else {
          promise.reject("TCP_CONNECTION_NOT_FOUND", "Connection not found: \(connectionId)")
          return
        }
        
        // Add data to the send queue
        tcpConnection.sendQueue.append(data)
        self.tcpConnections[connectionId] = tcpConnection
        
        // Resolve immediately - data is queued
        promise.resolve(true)
        
        // Process the queue if not already sending
        self.processTcpSendQueue(connectionId: connectionId)
      }
    }

    AsyncFunction("tcpClose") { (connectionId: String, promise: Promise) in
      self.networkQueue.async {
        guard let tcpConnection = self.tcpConnections[connectionId] else {
          promise.reject("TCP_CONNECTION_NOT_FOUND", "Connection not found: \(connectionId)")
          return
        }
        
        tcpConnection.connection.cancel()
        self.tcpConnections.removeValue(forKey: connectionId)
        promise.resolve(true)
      }
    }

    // UDP Socket functions
    AsyncFunction("udpCreateSocket") { (promise: Promise) in
      self.networkQueue.async {
        self.socketIdCounter += 1
        let socketId = "udp_\(self.socketIdCounter)"
        promise.resolve(socketId)
      }
    }

    AsyncFunction("udpBind") { (socketId: String, port: Int?, address: String?, promise: Promise) in
      self.networkQueue.async {
        let bindPort = port ?? 0
        let bindAddress = address ?? "0.0.0.0"
        
        do {
          // Create UDP listener using NWListener
          let udpParams = NWParameters.udp
          udpParams.allowLocalEndpointReuse = true
          udpParams.acceptLocalOnly = false
          
          let listener = try NWListener(using: udpParams, on: NWEndpoint.Port(integerLiteral: UInt16(bindPort)))
          
          listener.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
              if let actualPort = listener.port {
                let boundAddress = bindAddress == "0.0.0.0" ? "127.0.0.1" : bindAddress
                
                self?.networkQueue.async {
                  let udpSocket = UdpSocket(
                    listener: listener,
                    socketId: socketId,
                    receiveConnections: [:],
                    sendConnections: [:]
                  )
                  self?.udpSockets[socketId] = udpSocket
                }
                
                print("UDP socket bound to \(boundAddress):\(Int(actualPort.rawValue))")
                self?.sendEvent("udpListening", [
                  "socketId": socketId,
                  "address": boundAddress,
                  "port": Int(actualPort.rawValue)
                ])
                promise.resolve([
                  "address": boundAddress,
                  "port": Int(actualPort.rawValue)
                ])
              }
            case .failed(let error):
              print("UDP bind failed: \(error.localizedDescription)")
              self?.networkQueue.async {
                self?.udpSockets.removeValue(forKey: socketId)
              }
              promise.reject("UDP_BIND_FAILED", "Failed to bind: \(error.localizedDescription)")
            case .cancelled:
              print("UDP listener cancelled for socket: \(socketId)")
              self?.networkQueue.async {
                self?.udpSockets.removeValue(forKey: socketId)
              }
              self?.sendEvent("udpClose", ["socketId": socketId])
            default:
              break
            }
          }
          
          // Handle incoming UDP connections using NWConnection
          listener.newConnectionHandler = { [weak self] connection in
            print("New UDP connection received for socket: \(socketId)")
            
            // Accept the connection immediately
            self?.handleIncomingUdpConnection(socketId: socketId, connection: connection)
          }
          
          // Set service to accept new connections
          listener.service = nil
          
          listener.start(queue: self.networkQueue)
          
        } catch {
          print("Failed to create UDP listener: \(error.localizedDescription)")
          promise.reject("UDP_BIND_FAILED", "Failed to create listener: \(error.localizedDescription)")
        }
      }
    }

    AsyncFunction("udpSend") { (socketId: String, data: Data, port: Int, address: String, promise: Promise) in
      self.networkQueue.async {
        guard var udpSocket = self.udpSockets[socketId] else {
          promise.reject("UDP_SOCKET_NOT_FOUND", "Socket not found: \(socketId)")
          return
        }
        
        let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(address), port: NWEndpoint.Port(integerLiteral: UInt16(port)))
        let connectionKey = "\(address):\(port)"
        
        // Reuse existing NWConnection or create new one
        if let existingConnection = udpSocket.sendConnections[connectionKey],
           existingConnection.state == .ready {
          // Connection is ready, send immediately
          existingConnection.send(content: data, completion: .contentProcessed { error in
            if let error = error {
              promise.reject("UDP_SEND_FAILED", "Failed to send data: \(error.localizedDescription)")
            } else {
              promise.resolve(true)
            }
          })
        } else {
          // Create new UDP connection for sending
          let connection = NWConnection(to: endpoint, using: .udp)
          
          connection.stateUpdateHandler = { [weak self] state in
            switch state {
            case .ready:
              // Send the data once connection is ready
              connection.send(content: data, completion: .contentProcessed { error in
                if let error = error {
                  promise.reject("UDP_SEND_FAILED", "Failed to send data: \(error.localizedDescription)")
                } else {
                  promise.resolve(true)
                }
              })
            case .failed(let error):
              // Remove failed connection
              self?.networkQueue.async {
                if var socket = self?.udpSockets[socketId] {
                  socket.sendConnections.removeValue(forKey: connectionKey)
                  self?.udpSockets[socketId] = socket
                }
              }
              promise.reject("UDP_SEND_FAILED", "Failed to connect: \(error.localizedDescription)")
            case .cancelled:
              // Remove cancelled connection
              self?.networkQueue.async {
                if var socket = self?.udpSockets[socketId] {
                  socket.sendConnections.removeValue(forKey: connectionKey)
                  self?.udpSockets[socketId] = socket
                }
              }
            default:
              break
            }
          }
          
          // Store the connection and start it
          udpSocket.sendConnections[connectionKey] = connection
          self.udpSockets[socketId] = udpSocket
          connection.start(queue: self.networkQueue)
        }
      }
    }

    AsyncFunction("udpClose") { (socketId: String, promise: Promise) in
      self.networkQueue.async {
        guard let udpSocket = self.udpSockets[socketId] else {
          promise.reject("UDP_SOCKET_NOT_FOUND", "Socket not found: \(socketId)")
          return
        }
        
        // Close listener
        udpSocket.listener.cancel()
        
        // Close all receive connections
        for (_, connection) in udpSocket.receiveConnections {
          connection.cancel()
        }
        
        // Close all send connections
        for (_, connection) in udpSocket.sendConnections {
          connection.cancel()
        }
        
        self.udpSockets.removeValue(forKey: socketId)
        promise.resolve(true)
      }
    }

    // Events
    Events("tcpData", "tcpError", "tcpClose", "udpMessage", "udpError", "udpListening", "udpClose")
  }
  
  // MARK: - TCP Helper Methods
  
  private func processTcpSendQueue(connectionId: String) {
    networkQueue.async { [weak self] in
      guard let self = self else { return }
      guard var tcpConnection = self.tcpConnections[connectionId] else { return }
      
      // If already sending, let the current send complete first
      if tcpConnection.isSending {
        return
      }
      
      // If queue is empty, nothing to send
      guard !tcpConnection.sendQueue.isEmpty else {
        return
      }
      
      // Mark as sending and get the first item
      tcpConnection.isSending = true
      let data = tcpConnection.sendQueue.removeFirst()
      self.tcpConnections[connectionId] = tcpConnection
      
      // Send the data
      tcpConnection.connection.send(content: data, completion: .contentProcessed { [weak self] error in
        self?.networkQueue.async {
          guard var connection = self?.tcpConnections[connectionId] else { return }
          
          if let error = error {
            print("TCP send error for \(connectionId): \(error.localizedDescription)")
            self?.sendEvent("tcpError", [
              "connectionId": connectionId,
              "error": error.localizedDescription
            ])
            // Clear the queue on error
            connection.sendQueue.removeAll()
            connection.isSending = false
            self?.tcpConnections[connectionId] = connection
            return
          }
          
          // Mark as not sending and process next item
          connection.isSending = false
          self?.tcpConnections[connectionId] = connection
          
          // Process next item in queue
          self?.processTcpSendQueue(connectionId: connectionId)
        }
      })
    }
  }
  
  private func startTcpReceiving(for tcpConnection: TcpConnection) {
    tcpConnection.connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
      if let data = data, !data.isEmpty {
        self?.sendEvent("tcpData", [
          "connectionId": tcpConnection.connectionId,
          "data": data
        ])
      }
      
      if let error = error {
        self?.sendEvent("tcpError", [
          "connectionId": tcpConnection.connectionId,
          "error": error.localizedDescription
        ])
        self?.networkQueue.async {
          self?.tcpConnections.removeValue(forKey: tcpConnection.connectionId)
        }
        return
      }
      
      if isComplete {
        self?.sendEvent("tcpClose", ["connectionId": tcpConnection.connectionId])
        self?.networkQueue.async {
          self?.tcpConnections.removeValue(forKey: tcpConnection.connectionId)
        }
        return
      }
      
      // Continue receiving
      self?.startTcpReceiving(for: tcpConnection)
    }
  }
  
  // MARK: - UDP Helper Methods
  
  private func handleIncomingUdpConnection(socketId: String, connection: NWConnection) {
    let remoteEndpoint = connection.endpoint
    var connectionKey = "unknown"
    
    switch remoteEndpoint {
    case .hostPort(let host, let hostPort):
      connectionKey = "\(host):\(hostPort.rawValue)"
    default:
      connectionKey = "unknown:\(UUID().uuidString)"
    }
    
    print("[UDP] Handling connection from: \(connectionKey) for socket: \(socketId)")
    
    // Store the receive connection
    networkQueue.async { [weak self] in
      if var socket = self?.udpSockets[socketId] {
        socket.receiveConnections[connectionKey] = connection
        self?.udpSockets[socketId] = socket
        print("[UDP] Stored receive connection for: \(connectionKey)")
      }
    }
    
    // Set up state handler for the connection
    connection.stateUpdateHandler = { [weak self] state in
      print("[UDP] Connection state for \(connectionKey): \(state)")
      switch state {
      case .ready:
        print("[UDP] Receive connection ready: \(connectionKey)")
      case .failed(let error):
        print("[UDP] Receive connection failed for \(connectionKey): \(error.localizedDescription)")
        self?.sendEvent("udpError", [
          "socketId": socketId,
          "error": error.localizedDescription
        ])
        self?.networkQueue.async {
          if var socket = self?.udpSockets[socketId] {
            socket.receiveConnections.removeValue(forKey: connectionKey)
            self?.udpSockets[socketId] = socket
          }
        }
      case .cancelled:
        print("[UDP] Receive connection cancelled: \(connectionKey)")
        self?.networkQueue.async {
          if var socket = self?.udpSockets[socketId] {
            socket.receiveConnections.removeValue(forKey: connectionKey)
            self?.udpSockets[socketId] = socket
          }
        }
      case .preparing:
        print("[UDP] Connection preparing: \(connectionKey)")
      case .waiting(let error):
        print("[UDP] Connection waiting for \(connectionKey): \(error)")
      case .setup:
        print("[UDP] Connection setup: \(connectionKey)")
      @unknown default:
        print("[UDP] Unknown connection state for: \(connectionKey)")
      }
    }
    
    // Start the connection FIRST
    print("[UDP] Starting connection for: \(connectionKey)")
    connection.start(queue: networkQueue)
    
    // Start receiving messages on this connection
    startUdpReceiving(socketId: socketId, connection: connection, connectionKey: connectionKey)
  }
  
  private func startUdpReceiving(socketId: String, connection: NWConnection, connectionKey: String) {
    print("[UDP] Starting receive loop for: \(connectionKey)")
    
    connection.receiveMessage { [weak self] data, context, isComplete, error in
      if let data = data, !data.isEmpty {
        print("[UDP] Received message on socket \(socketId): \(data.count) bytes from \(connectionKey)")
        
        let remoteEndpoint = connection.endpoint
        var address = ""
        var port = 0
        
        switch remoteEndpoint {
        case .hostPort(let host, let hostPort):
          address = "\(host)"
          port = Int(hostPort.rawValue)
          print("[UDP] Message from \(address):\(port)")
        default:
          address = "unknown"
          port = 0
          print("[UDP] Message from unknown endpoint")
        }
        
        self?.sendEvent("udpMessage", [
          "socketId": socketId,
          "data": data,
          "address": address,
          "port": port
        ])
      } else {
        print("[UDP] receiveMessage called but no data (isComplete: \(isComplete))")
      }
      
      if let error = error {
        print("[UDP] Receive error for \(connectionKey): \(error.localizedDescription)")
        self?.sendEvent("udpError", [
          "socketId": socketId,
          "error": error.localizedDescription
        ])
        return
      }
      
      // Continue receiving if not complete
      if !isComplete {
        print("[UDP] Continuing receive for: \(connectionKey)")
        self?.startUdpReceiving(socketId: socketId, connection: connection, connectionKey: connectionKey)
      } else {
        print("[UDP] Receive completed for: \(connectionKey)")
        self?.networkQueue.async {
          if var socket = self?.udpSockets[socketId] {
            socket.receiveConnections.removeValue(forKey: connectionKey)
            self?.udpSockets[socketId] = socket
          }
        }
      }
    }
  }
  
  // MARK: - Thumbnail Helper Methods
  
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
