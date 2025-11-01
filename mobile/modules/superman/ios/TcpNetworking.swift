import ExpoModulesCore
import Network

class TcpNetworking {
  private var connections: [String: TcpConnection] = [:]
  private var connectionIdCounter = 0
  private let networkQueue = DispatchQueue(label: "superman.tcp", qos: .userInitiated)
  
  // Closure to send events back to the module
  var sendEvent: ((String, [String: Any]) -> Void)?
  
  struct TcpConnection {
    let connection: NWConnection
    let connectionId: String
    var sendQueue: [Data] = []
    var isSending: Bool = false
  }
  
  // MARK: - Public Methods
  
  func connect(host: String, port: Int, promise: Promise) {
    networkQueue.async {
      self.connectionIdCounter += 1
      let connectionId = "tcp_\(self.connectionIdCounter)"
      
      let endpoint = NWEndpoint.hostPort(host: NWEndpoint.Host(host), port: NWEndpoint.Port(integerLiteral: UInt16(port)))
      let connection = NWConnection(to: endpoint, using: .tcp)
      
      let tcpConnection = TcpConnection(connection: connection, connectionId: connectionId)
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
        promise.reject("TCP_CONNECTION_NOT_FOUND", "Connection not found: \(connectionId)")
        return
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
        promise.reject("TCP_CONNECTION_NOT_FOUND", "Connection not found: \(connectionId)")
        return
      }
      
      tcpConnection.connection.cancel()
      self.connections.removeValue(forKey: connectionId)
      promise.resolve(true)
    }
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
            self?.sendEvent?("tcpError", [
              "connectionId": connectionId,
              "error": error.localizedDescription
            ])
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
        self?.sendEvent?("tcpError", [
          "connectionId": tcpConnection.connectionId,
          "error": error.localizedDescription
        ])
        self?.networkQueue.async {
          self?.connections.removeValue(forKey: tcpConnection.connectionId)
        }
        return
      }
      
      if isComplete {
        self?.sendEvent?("tcpClose", ["connectionId": tcpConnection.connectionId])
        self?.networkQueue.async {
          self?.connections.removeValue(forKey: tcpConnection.connectionId)
        }
        return
      }
      
      // Continue receiving
      self?.startReceiving(for: tcpConnection)
    }
  }
}

