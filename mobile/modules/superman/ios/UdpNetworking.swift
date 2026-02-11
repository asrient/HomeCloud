import ExpoModulesCore
import Network

class UdpNetworking {
  private var sockets: [String: UdpSocket] = [:]
  private var socketIdCounter = 0
  private let networkQueue = DispatchQueue(label: "superman.udp", qos: .userInitiated)
  
  // Closure to send events back to the module
  var sendEvent: ((String, [String: Any]) -> Void)?
  
  struct UdpSocket {
    let listener: NWListener
    let socketId: String
    let localPort: NWEndpoint.Port
    var connections: [String: NWConnection] = [:]
    var isClosed: Bool = false
  }
  
  // MARK: - Public Methods
  
  func createSocket(promise: Promise) {
    networkQueue.async {
      self.socketIdCounter += 1
      let socketId = "udp_\(self.socketIdCounter)"
      promise.resolve(socketId)
    }
  }
  
  func bind(socketId: String, port: Int?, address: String?, promise: Promise) {
    networkQueue.async {
      let bindPort = port ?? 0
      let bindAddress = address ?? "0.0.0.0"
      
      do {
        // Create UDP parameters
        let udpParams = NWParameters.udp
        udpParams.allowLocalEndpointReuse = true
        udpParams.includePeerToPeer = true
        udpParams.acceptLocalOnly = false
        
        // Create listener
        let nwPort: NWEndpoint.Port?
        if bindPort == 0 {
          nwPort = nil // Let system choose port
        } else {
          nwPort = NWEndpoint.Port(integerLiteral: UInt16(bindPort))
        }
        
        let listener = try NWListener(using: udpParams, on: nwPort ?? NWEndpoint.Port.any)
        
        listener.stateUpdateHandler = { [weak self] state in
          switch state {
          case .ready:
            if let actualPort = listener.port {
              
              self?.networkQueue.async {
                let udpSocket = UdpSocket(
                  listener: listener,
                  socketId: socketId,
                  localPort: actualPort,
                  connections: [:]
                )
                self?.sockets[socketId] = udpSocket
              }
              
              print("[UDP] Socket bound to \(bindAddress):\(Int(actualPort.rawValue))")
              self?.sendEvent?("udpListening", [
                "socketId": socketId,
                "address": bindAddress,
                "port": Int(actualPort.rawValue)
              ])
              promise.resolve([
                "address": bindAddress,
                "port": Int(actualPort.rawValue)
              ])
            }
          case .failed(let error):
            print("[UDP] Bind failed: \(error)")
            self?.networkQueue.async {
              self?.sockets.removeValue(forKey: socketId)
            }
            promise.reject("UDP_BIND_FAILED", "Failed to bind: \(error.localizedDescription)")
          case .cancelled:
            print("[UDP] Listener cancelled for socket: \(socketId)")
            self?.networkQueue.async {
              self?.sockets.removeValue(forKey: socketId)
            }
            self?.sendEvent?("udpClose", ["socketId": socketId])
          default:
            break
          }
        }
        
        // Handle incoming UDP connections
        listener.newConnectionHandler = { [weak self] connection in
          print("[UDP] New incoming connection for socket: \(socketId)")
          
          // Start the connection immediately
          connection.start(queue: self?.networkQueue ?? DispatchQueue.global())
          
          self?.handleIncomingConnection(socketId: socketId, connection: connection)
        }
        
        listener.start(queue: self.networkQueue)
        
      } catch {
        print("[UDP] Failed to create listener: \(error)")
        promise.reject("UDP_BIND_FAILED", "Failed to create listener: \(error.localizedDescription)")
      }
    }
  }
  
  func send(socketId: String, data: Data, port: Int, address: String, promise: Promise) {
    networkQueue.async {
      guard var udpSocket = self.sockets[socketId] else {
        promise.reject("UDP_SOCKET_NOT_FOUND", "Socket not found: \(socketId)")
        return
      }
      
      let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(address), port: NWEndpoint.Port(integerLiteral: UInt16(port)))
      let connectionKey = "\(address):\(port)"
      
      // Reuse existing NWConnection or create new one
      if let existingConnection = udpSocket.connections[connectionKey],
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
        // Create new UDP connection for sending and receiving
        // Configure UDP parameters to use the same local port as the listener
        let udpParams = NWParameters.udp
        udpParams.allowLocalEndpointReuse = true
        udpParams.requiredLocalEndpoint = NWEndpoint.hostPort(
          host: NWEndpoint.Host.ipv4(.any),
          port: udpSocket.localPort
        )
        
        let connection = NWConnection(to: endpoint, using: udpParams)
        
        connection.stateUpdateHandler = { [weak self] state in
          switch state {
          case .ready:
            print("[UDP] Connection ready to \(connectionKey), starting receive loop")
            // Send the data once connection is ready
            connection.send(content: data, completion: .contentProcessed { error in
              if let error = error {
                promise.reject("UDP_SEND_FAILED", "Failed to send data: \(error.localizedDescription)")
              } else {
                promise.resolve(true)
              }
            })
            // Start receiving on this connection
            self?.startReceiving(socketId: socketId, connection: connection, connectionKey: connectionKey)
          case .failed(let error):
            print("[UDP] Connection failed to \(connectionKey): \(error.localizedDescription)")
            self?.networkQueue.async {
              guard var socket = self?.sockets[socketId], !socket.isClosed else {
                promise.reject("UDP_SEND_FAILED", "Failed to connect: \(error.localizedDescription)")
                return
              }
              socket.isClosed = true
              self?.sockets[socketId] = socket
              
              self?.sendEvent?("udpError", [
                "socketId": socketId,
                "error": error.localizedDescription
              ])
              socket.connections.removeValue(forKey: connectionKey)
              self?.sockets[socketId] = socket
              self?.sendEvent?("udpClose", ["socketId": socketId])
              self?.sockets.removeValue(forKey: socketId)
              promise.reject("UDP_SEND_FAILED", "Failed to connect: \(error.localizedDescription)")
            }
          case .cancelled:
            print("[UDP] Connection cancelled to \(connectionKey)")
            // Remove cancelled connection
            self?.networkQueue.async {
              if var socket = self?.sockets[socketId] {
                socket.connections.removeValue(forKey: connectionKey)
                self?.sockets[socketId] = socket
              }
            }
          default:
            break
          }
        }
        
        // Store the connection and start it
        udpSocket.connections[connectionKey] = connection
        self.sockets[socketId] = udpSocket
        connection.start(queue: self.networkQueue)
      }
    }
  }
  
  func close(socketId: String, promise: Promise) {
    networkQueue.async {
      guard var udpSocket = self.sockets[socketId] else {
        // Already closed, that's fine
        promise.resolve(true)
        return
      }
      
      // Mark as closed to prevent duplicate events
      if udpSocket.isClosed {
        promise.resolve(true)
        return
      }
      udpSocket.isClosed = true
      self.sockets[socketId] = udpSocket
      
      // Close listener
      udpSocket.listener.cancel()
      
      // Close all connections
      for (_, connection) in udpSocket.connections {
        connection.cancel()
      }
      
      self.sockets.removeValue(forKey: socketId)
      promise.resolve(true)
    }
  }
  
  // MARK: - Private Methods
  
  private func handleIncomingConnection(socketId: String, connection: NWConnection) {
    let remoteEndpoint = connection.endpoint
    var connectionKey = "unknown"
    
    switch remoteEndpoint {
    case .hostPort(let host, let hostPort):
      connectionKey = "\(host):\(hostPort.rawValue)"
    default:
      connectionKey = "unknown:\(UUID().uuidString)"
    }
    
    print("[UDP] Handling incoming connection from: \(connectionKey)")
    
    // Store the connection
    networkQueue.async { [weak self] in
      if var socket = self?.sockets[socketId] {
        socket.connections[connectionKey] = connection
        self?.sockets[socketId] = socket
        print("[UDP] Stored incoming connection for: \(connectionKey)")
      }
    }
    
    // Set up state handler
    connection.stateUpdateHandler = { [weak self] state in
      print("[UDP] Incoming connection state for \(connectionKey): \(state)")
      switch state {
      case .ready:
        print("[UDP] Incoming connection ready: \(connectionKey)")
      case .failed(let error):
        print("[UDP] Incoming connection failed for \(connectionKey): \(error.localizedDescription)")
        self?.networkQueue.async {
          guard var socket = self?.sockets[socketId], !socket.isClosed else {
            return
          }
          socket.isClosed = true
          self?.sockets[socketId] = socket
          
          self?.sendEvent?("udpError", [
            "socketId": socketId,
            "error": error.localizedDescription
          ])
          socket.connections.removeValue(forKey: connectionKey)
          self?.sockets[socketId] = socket
          self?.sendEvent?("udpClose", ["socketId": socketId])
          self?.sockets.removeValue(forKey: socketId)
        }
      case .cancelled:
        print("[UDP] Incoming connection cancelled: \(connectionKey)")
        self?.networkQueue.async {
          if var socket = self?.sockets[socketId] {
            socket.connections.removeValue(forKey: connectionKey)
            self?.sockets[socketId] = socket
          }
        }
      default:
        break
      }
    }
    
    // Start the connection
    print("[UDP] Starting incoming connection for: \(connectionKey)")
    connection.start(queue: networkQueue)
    
    // Start receiving messages
    startReceiving(socketId: socketId, connection: connection, connectionKey: connectionKey)
  }
  
  private func startReceiving(socketId: String, connection: NWConnection, connectionKey: String) {
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
        
        self?.sendEvent?("udpMessage", [
          "socketId": socketId,
          "data": data,
          "address": address,
          "port": port
        ])
      } else if !isComplete {
        print("[UDP] receiveMessage called but no data (isComplete: \(isComplete))")
      }
      
      if let error = error {
        print("[UDP] Receive error for \(connectionKey): \(error.localizedDescription)")
        self?.networkQueue.async {
          guard var socket = self?.sockets[socketId], !socket.isClosed else {
            return
          }
          socket.isClosed = true
          self?.sockets[socketId] = socket
          
          self?.sendEvent?("udpError", [
            "socketId": socketId,
            "error": error.localizedDescription
          ])
          socket.connections.removeValue(forKey: connectionKey)
          self?.sockets[socketId] = socket
          self?.sendEvent?("udpClose", ["socketId": socketId])
          self?.sockets.removeValue(forKey: socketId)
        }
        return
      }
      
      // For UDP, always continue receiving unless there's an error
      // Each datagram is complete (isComplete=true), but we want to receive multiple datagrams
      print("[UDP] Continuing receive for: \(connectionKey)")
      self?.startReceiving(socketId: socketId, connection: connection, connectionKey: connectionKey)
    }
  }
}
