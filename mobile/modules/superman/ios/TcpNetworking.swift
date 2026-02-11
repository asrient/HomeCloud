import ExpoModulesCore
import Network
import UIKit

class TcpNetworking {
  private var connections: [String: TcpConnection] = [:]
  private var connectionIdCounter = 0
  private let networkQueue = DispatchQueue(label: "superman.tcp", qos: .userInitiated)
  
  // Server properties
  private var listener: NWListener?
  private var serverPort: UInt16 = 0
  private var wasServerRunning: Bool = false
  private var lastServerPort: Int = 0
  
  // Lifecycle observation
  private var backgroundObserver: NSObjectProtocol?
  private var foregroundObserver: NSObjectProtocol?
  
  // Closure to send events back to the module
  var sendEvent: ((String, [String: Any]) -> Void)?
  
  struct TcpConnection {
    let connection: NWConnection
    let connectionId: String
    var sendQueue: [Data] = []
    var isSending: Bool = false
    var isIncoming: Bool = false
    var isClosed: Bool = false
  }
  
  // MARK: - Error Handling
  
  private func sendErrorAndClose(connectionId: String, error: NWError) {
    // Check if already closed to prevent duplicate events
    networkQueue.async {
      guard var connection = self.connections[connectionId], !connection.isClosed else {
        return
      }
      connection.isClosed = true
      self.connections[connectionId] = connection
      
      self.sendEvent?("tcpError", [
        "connectionId": connectionId,
        "error": error.localizedDescription
      ])
      // All socket errors mean the connection is dead, send close event
      self.sendEvent?("tcpClose", ["connectionId": connectionId])
      self.connections.removeValue(forKey: connectionId)
    }
  }
  
  init() {
    setupLifecycleObservers()
  }
  
  deinit {
    removeLifecycleObservers()
  }
  
  // MARK: - Lifecycle Management
  
  private func setupLifecycleObservers() {
    backgroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.didEnterBackgroundNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.handleEnterBackground()
    }
    
    foregroundObserver = NotificationCenter.default.addObserver(
      forName: UIApplication.willEnterForegroundNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      self?.handleEnterForeground()
    }
  }
  
  private func removeLifecycleObservers() {
    if let observer = backgroundObserver {
      NotificationCenter.default.removeObserver(observer)
    }
    if let observer = foregroundObserver {
      NotificationCenter.default.removeObserver(observer)
    }
  }
  
  private func handleEnterBackground() {
    networkQueue.async {
      // Remember if server was running
      self.wasServerRunning = self.listener != nil
      if self.wasServerRunning {
        self.lastServerPort = Int(self.serverPort)
      }
      print("[TcpNetworking] Entering background, server was running: \(self.wasServerRunning)")
    }
  }
  
  private func handleEnterForeground() {
    networkQueue.async {
      print("[TcpNetworking] Entering foreground...")
      
      // Auto-restart server if it was running
      if self.wasServerRunning && self.lastServerPort > 0 {
        print("[TcpNetworking] Checking if server needs restart on port \(self.lastServerPort)")
        self.restartServer(port: self.lastServerPort)
      }
    }
  }
  
  private func restartServer(port: Int) {
    // Check if server is still running
    if let existingListener = self.listener {
      switch existingListener.state {
      case .ready, .setup:
        print("[TcpNetworking] Server is still running, skipping restart")
        return
      default:
        // Server is in failed/cancelled/waiting state, clean it up
        existingListener.cancel()
        self.listener = nil
      }
    }
    
    do {
      let parameters = NWParameters.tcp
      parameters.allowLocalEndpointReuse = true
      
      let newListener = try NWListener(using: parameters, on: NWEndpoint.Port(integerLiteral: UInt16(port)))
      self.listener = newListener
      self.serverPort = UInt16(port)
      
      newListener.stateUpdateHandler = { [weak self] state in
        switch state {
        case .ready:
          print("[TcpNetworking] Server auto-restarted successfully on port \(port)")
        case .failed(let error):
          print("[TcpNetworking] Failed to auto-restart server: \(error.localizedDescription)")
          self?.listener = nil
          self?.wasServerRunning = false
        case .cancelled:
          self?.listener = nil
        default:
          break
        }
      }
      
      newListener.newConnectionHandler = { [weak self] newConnection in
        self?.handleIncomingConnection(newConnection)
      }
      
      newListener.start(queue: self.networkQueue)
    } catch {
      print("[TcpNetworking] Failed to create listener for auto-restart: \(error.localizedDescription)")
      self.wasServerRunning = false
    }
  }
  
  // MARK: - Public Methods
  
  func connect(host: String, port: Int, promise: Promise) {
    networkQueue.async {
      self.connectionIdCounter += 1
      let connectionId = "tcp_\(self.connectionIdCounter)"
      
      let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(host), port: NWEndpoint.Port(integerLiteral: UInt16(port)))
      let connection = NWConnection(to: endpoint, using: .tcp)
      
      let tcpConnection = TcpConnection(connection: connection, connectionId: connectionId, isIncoming: false)
      self.connections[connectionId] = tcpConnection
      
      connection.stateUpdateHandler = { [weak self] state in
        switch state {
        case .ready:
          promise.resolve(connectionId)
          self?.startReceiving(for: tcpConnection)
        case .failed(let error):
          self?.networkQueue.async {
            self?.connections.removeValue(forKey: connectionId)
          }
          promise.reject("TCP_CONNECT_FAILED", "Failed to connect: \(error.localizedDescription)")
        case .cancelled:
          self?.networkQueue.async {
            self?.connections.removeValue(forKey: connectionId)
          }
          self?.sendEvent?("tcpClose", ["connectionId": connectionId])
        default:
          break
        }
      }
      
      connection.start(queue: self.networkQueue)
    }
  }
  
  func send(connectionId: String, data: Data, promise: Promise) {
    networkQueue.async {
      guard var tcpConnection = self.connections[connectionId] else {
        // Connection not found - it was closed, resolve with false
        promise.resolve(false)
        return
      }
      
      // Check if connection is still in a valid state
      switch tcpConnection.connection.state {
      case .cancelled, .failed:
        self.connections.removeValue(forKey: connectionId)
        promise.resolve(false)
        return
      default:
        break
      }
      
      // Add data to the send queue
      tcpConnection.sendQueue.append(data)
      self.connections[connectionId] = tcpConnection
      
      // Resolve immediately - data is queued
      promise.resolve(true)
      
      // Process the queue if not already sending
      self.processSendQueue(connectionId: connectionId)
    }
  }
  
  func close(connectionId: String, promise: Promise) {
    networkQueue.async {
      guard let tcpConnection = self.connections[connectionId] else {
        // Connection not found - already closed, that's fine
        promise.resolve(true)
        return
      }
      
      tcpConnection.connection.cancel()
      self.connections.removeValue(forKey: connectionId)
      promise.resolve(true)
    }
  }
  
  // MARK: - Server Methods
  
  func startServer(port: Int, promise: Promise) {
    networkQueue.async {
      // Stop existing listener if any
      if self.listener != nil {
        self.listener?.cancel()
        self.listener = nil
      }
      
      do {
        let parameters = NWParameters.tcp
        parameters.allowLocalEndpointReuse = true
        
        let listener = try NWListener(using: parameters, on: NWEndpoint.Port(integerLiteral: UInt16(port)))
        self.listener = listener
        self.serverPort = UInt16(port)
        
        listener.stateUpdateHandler = { [weak self] state in
          switch state {
          case .ready:
            if let actualPort = listener.port?.rawValue {
              promise.resolve(["port": Int(actualPort)])
            } else {
              promise.resolve(["port": port])
            }
          case .failed(let error):
            self?.listener = nil
            promise.reject("TCP_SERVER_FAILED", "Failed to start server: \(error.localizedDescription)")
          case .cancelled:
            self?.listener = nil
          default:
            break
          }
        }
        
        listener.newConnectionHandler = { [weak self] newConnection in
          self?.handleIncomingConnection(newConnection)
        }
        
        listener.start(queue: self.networkQueue)
      } catch {
        promise.reject("TCP_SERVER_FAILED", "Failed to create listener: \(error.localizedDescription)")
      }
    }
  }
  
  func stopServer(promise: Promise) {
    networkQueue.async {
      guard let listener = self.listener else {
        promise.resolve(true)
        return
      }
      
      listener.cancel()
      self.listener = nil
      self.serverPort = 0
      promise.resolve(true)
    }
  }
  
  private func handleIncomingConnection(_ connection: NWConnection) {
    connectionIdCounter += 1
    let connectionId = "tcp_\(connectionIdCounter)"
    
    let tcpConnection = TcpConnection(connection: connection, connectionId: connectionId, isIncoming: true)
    
    connection.stateUpdateHandler = { [weak self] state in
      switch state {
      case .ready:
        self?.connections[connectionId] = tcpConnection
        // Notify JS about the new incoming connection
        self?.sendEvent?("tcpIncomingConnection", ["connectionId": connectionId])
        self?.startReceiving(for: tcpConnection)
      case .failed(let error):
        self?.networkQueue.async {
          self?.connections.removeValue(forKey: connectionId)
        }
        self?.sendErrorAndClose(connectionId: connectionId, error: error)
      case .cancelled:
        self?.networkQueue.async {
          self?.connections.removeValue(forKey: connectionId)
        }
        self?.sendEvent?("tcpClose", ["connectionId": connectionId])
      default:
        break
      }
    }
    
    connection.start(queue: networkQueue)
  }
  
  // MARK: - Private Methods
  
  private func processSendQueue(connectionId: String) {
    networkQueue.async { [weak self] in
      guard let self = self else { return }
      guard var tcpConnection = self.connections[connectionId] else { return }
      
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
      self.connections[connectionId] = tcpConnection
      
      // Send the data
      tcpConnection.connection.send(content: data, completion: .contentProcessed { [weak self] error in
        self?.networkQueue.async {
          guard var connection = self?.connections[connectionId] else { return }
          
          if let error = error {
            print("TCP send error for \(connectionId): \(error.localizedDescription)")
            self?.sendErrorAndClose(connectionId: connectionId, error: error)
            // Clear the queue on error
            connection.sendQueue.removeAll()
            connection.isSending = false
            self?.connections[connectionId] = connection
            return
          }
          
          // Mark as not sending and process next item
          connection.isSending = false
          self?.connections[connectionId] = connection
          
          // Process next item in queue
          self?.processSendQueue(connectionId: connectionId)
        }
      })
    }
  }
  
  private func startReceiving(for tcpConnection: TcpConnection) {
    tcpConnection.connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, _, isComplete, error in
      if let data = data, !data.isEmpty {
        self?.sendEvent?("tcpData", [
          "connectionId": tcpConnection.connectionId,
          "data": data
        ])
      }
      
      if let error = error {
        self?.sendErrorAndClose(connectionId: tcpConnection.connectionId, error: error)
        return
      }
      
      if isComplete {
        self?.networkQueue.async {
          guard var connection = self?.connections[tcpConnection.connectionId], !connection.isClosed else {
            return
          }
          connection.isClosed = true
          self?.connections[tcpConnection.connectionId] = connection
          self?.sendEvent?("tcpClose", ["connectionId": tcpConnection.connectionId])
          self?.connections.removeValue(forKey: tcpConnection.connectionId)
        }
        return
      }
      
      // Continue receiving
      self?.startReceiving(for: tcpConnection)
    }
  }
}

