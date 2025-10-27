import ExpoModulesCore
import QuickLookThumbnailing
import UIKit
import Network

public class SupermanModule: Module {
  // TCP connection management
  private var tcpConnections: [String: TcpConnection] = [:]
  private var connectionIdCounter = 0
  private let queue = DispatchQueue(label: "superman.tcp", qos: .userInitiated)
  
  // UDP socket management
  private var udpSockets: [String: UdpSocket] = [:]
  private var socketIdCounter = 0
  private let udpQueue = DispatchQueue(label: "superman.udp", qos: .userInitiated)
  
  struct TcpConnection {
    let connection: NWConnection
    let connectionId: String
  }
  
  struct UdpSocket {
    let listener: NWListener?
    let socketId: String
    let isBound: Bool
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

    // TCP Client functions
    AsyncFunction("tcpConnect") { (host: String, port: Int, promise: Promise) in
      connectionIdCounter += 1
      let connectionId = "tcp_\(connectionIdCounter)"
      
      let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(host), port: NWEndpoint.Port(integerLiteral: UInt16(port)))
      let connection = NWConnection(to: endpoint, using: .tcp)
      
      let tcpConnection = TcpConnection(connection: connection, connectionId: connectionId)
      tcpConnections[connectionId] = tcpConnection
      
      connection.stateUpdateHandler = { [weak self] state in
        switch state {
        case .ready:
          promise.resolve(connectionId)
          self?.startReceiving(for: tcpConnection)
        case .failed(let error):
          self?.tcpConnections.removeValue(forKey: connectionId)
          promise.reject("TCP_CONNECT_FAILED", "Failed to connect: \(error.localizedDescription)")
        case .cancelled:
          self?.tcpConnections.removeValue(forKey: connectionId)
          self?.sendEvent("tcpClose", ["connectionId": connectionId])
        default:
          break
        }
      }
      
      connection.start(queue: queue)
    }

    AsyncFunction("tcpSend") { (connectionId: String, data: Data, promise: Promise) in
      guard let tcpConnection = tcpConnections[connectionId] else {
        promise.reject("TCP_CONNECTION_NOT_FOUND", "Connection not found: \(connectionId)")
        return
      }
      
      tcpConnection.connection.send(content: data, completion: .contentProcessed { error in
        if let error = error {
          promise.reject("TCP_SEND_FAILED", "Failed to send data: \(error.localizedDescription)")
        } else {
          promise.resolve(true)
        }
      })
    }

    AsyncFunction("tcpClose") { (connectionId: String, promise: Promise) in
      guard let tcpConnection = tcpConnections[connectionId] else {
        promise.reject("TCP_CONNECTION_NOT_FOUND", "Connection not found: \(connectionId)")
        return
      }
      
      tcpConnection.connection.cancel()
      tcpConnections.removeValue(forKey: connectionId)
      promise.resolve(true)
    }

    // UDP Socket functions
    AsyncFunction("udpCreateSocket") { (promise: Promise) in
      socketIdCounter += 1
      let socketId = "udp_\(socketIdCounter)"
      
      let udpSocket = UdpSocket(listener: nil, socketId: socketId, isBound: false)
      udpSockets[socketId] = udpSocket
      
      promise.resolve(socketId)
    }

    AsyncFunction("udpBind") { (socketId: String, port: Int?, address: String?, promise: Promise) in
      guard udpSockets[socketId] != nil else {
        promise.reject("UDP_SOCKET_NOT_FOUND", "Socket not found: \(socketId)")
        return
      }
      
      let bindPort = port ?? 0
      let bindAddress = address ?? "0.0.0.0"
      
      do {
        let listener = try NWListener(using: .udp, on: NWEndpoint.Port(integerLiteral: UInt16(bindPort)))
        
        listener.stateUpdateHandler = { [weak self] state in
          switch state {
          case .ready:
            if let actualPort = listener.port {
              let boundAddress = bindAddress == "0.0.0.0" ? "127.0.0.1" : bindAddress
              self?.udpSockets[socketId] = UdpSocket(listener: listener, socketId: socketId, isBound: true)
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
            self?.udpSockets.removeValue(forKey: socketId)
            promise.reject("UDP_BIND_FAILED", "Failed to bind: \(error.localizedDescription)")
          case .cancelled:
            print("UDP listener cancelled for socket: \(socketId)")
            self?.udpSockets.removeValue(forKey: socketId)
            self?.sendEvent("udpClose", ["socketId": socketId])
          default:
            break
          }
        }
        
        listener.newConnectionHandler = { [weak self] connection in
          print("New UDP connection received for socket: \(socketId)")
          self?.startUdpReceiving(for: socketId, connection: connection)
        }
        
        listener.start(queue: udpQueue)
        
      } catch {
        print("Failed to create UDP listener: \(error.localizedDescription)")
        udpSockets.removeValue(forKey: socketId)
        promise.reject("UDP_BIND_FAILED", "Failed to create listener: \(error.localizedDescription)")
      }
    }

    AsyncFunction("udpSend") { (socketId: String, data: Data, port: Int, address: String, promise: Promise) in
      guard var udpSocket = udpSockets[socketId] else {
        promise.reject("UDP_SOCKET_NOT_FOUND", "Socket not found: \(socketId)")
        return
      }
      
      let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(address), port: NWEndpoint.Port(integerLiteral: UInt16(port)))
      let connectionKey = "\(address):\(port)"
      
      // Reuse existing connection or create new one
      let connection: NWConnection
      if let existingConnection = udpSocket.sendConnections[connectionKey],
         existingConnection.state == .ready {
        connection = existingConnection
        
        // Send immediately since connection is ready
        connection.send(content: data, completion: .contentProcessed { error in
          if let error = error {
            promise.reject("UDP_SEND_FAILED", "Failed to send data: \(error.localizedDescription)")
          } else {
            promise.resolve(true)
          }
        })
      } else {
        // Create new connection
        connection = NWConnection(to: endpoint, using: .udp)
        udpSocket.sendConnections[connectionKey] = connection
        udpSockets[socketId] = udpSocket
        
        connection.stateUpdateHandler = { [weak self] state in
          switch state {
          case .ready:
            connection.send(content: data, completion: .contentProcessed { error in
              if let error = error {
                promise.reject("UDP_SEND_FAILED", "Failed to send data: \(error.localizedDescription)")
              } else {
                promise.resolve(true)
              }
            })
          case .failed(let error):
            // Remove failed connection
            if var socket = self?.udpSockets[socketId] {
              socket.sendConnections.removeValue(forKey: connectionKey)
              self?.udpSockets[socketId] = socket
            }
            promise.reject("UDP_SEND_FAILED", "Failed to connect: \(error.localizedDescription)")
          case .cancelled:
            // Remove cancelled connection
            if var socket = self?.udpSockets[socketId] {
              socket.sendConnections.removeValue(forKey: connectionKey)
              self?.udpSockets[socketId] = socket
            }
          default:
            break
          }
        }
        
        connection.start(queue: udpQueue)
      }
    }

    AsyncFunction("udpClose") { (socketId: String, promise: Promise) in
      guard let udpSocket = udpSockets[socketId] else {
        promise.reject("UDP_SOCKET_NOT_FOUND", "Socket not found: \(socketId)")
        return
      }
      
      // Close listener
      udpSocket.listener?.cancel()
      
      // Close all send connections
      for (_, connection) in udpSocket.sendConnections {
        connection.cancel()
      }
      
      udpSockets.removeValue(forKey: socketId)
      promise.resolve(true)
    }

    // Events
    Events("tcpData", "tcpError", "tcpClose", "udpMessage", "udpError", "udpListening", "udpClose")
  }
  
  private func startReceiving(for tcpConnection: TcpConnection) {
    tcpConnection.connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { [weak self] data, _, isComplete, error in
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
        self?.tcpConnections.removeValue(forKey: tcpConnection.connectionId)
        return
      }
      
      if isComplete {
        self?.sendEvent("tcpClose", ["connectionId": tcpConnection.connectionId])
        self?.tcpConnections.removeValue(forKey: tcpConnection.connectionId)
        return
      }
      
      // Continue receiving
      self?.startReceiving(for: tcpConnection)
    }
  }
  
  private func startUdpReceiving(for socketId: String, connection: NWConnection) {
    print("Starting UDP receiving for socket: \(socketId)")
    
    connection.stateUpdateHandler = { [weak self] state in
      switch state {
      case .ready:
        print("UDP connection ready for socket: \(socketId)")
      case .failed(let error):
        print("UDP connection failed for socket \(socketId): \(error.localizedDescription)")
        self?.sendEvent("udpError", [
          "socketId": socketId,
          "error": error.localizedDescription
        ])
      case .cancelled:
        print("UDP connection cancelled for socket: \(socketId)")
      default:
        print("UDP connection state changed for socket \(socketId): \(state)")
      }
    }
    
    connection.start(queue: udpQueue)
    
    func receiveNextMessage() {
      print("Waiting for next UDP message on socket: \(socketId)")
      connection.receiveMessage { [weak self] data, context, isComplete, error in
        if let data = data, !data.isEmpty {
          print("Received UDP message on socket \(socketId): \(data.count) bytes")
          let remoteEndpoint = connection.endpoint
          var address = ""
          var port = 0
          
          switch remoteEndpoint {
          case .hostPort(let host, let hostPort):
            address = "\(host)"
            port = Int(hostPort.rawValue)
            print("UDP message from \(address):\(port)")
          default:
            address = "unknown"
            port = 0
            print("UDP message from unknown endpoint")
          }
          
          self?.sendEvent("udpMessage", [
            "socketId": socketId,
            "data": data,
            "address": address,
            "port": port
          ])
        }
        
        if let error = error {
          print("UDP receive error for socket \(socketId): \(error.localizedDescription)")
          self?.sendEvent("udpError", [
            "socketId": socketId,
            "error": error.localizedDescription
          ])
          return
        }
        
        if !isComplete {
          receiveNextMessage()
        } else {
          print("UDP receive completed for socket: \(socketId)")
        }
      }
    }
    
    receiveNextMessage()
  }
}
