import Foundation

/// A small SignalR hub client (JSON protocol over WebSockets) with only what VirtuBattle needs:
/// invoke-with-result, fire-and-forget sends, server-to-client handlers, keep-alive pings.
///
/// Kept dependency-free on purpose so the protocol is easy to follow and to port to Android.
/// Reconnecting is left to the caller for now.
public actor HubConnection {
    public enum ConnectionError: Error, LocalizedError, Equatable {
        case notConnected
        case handshakeFailed(String)
        case closed(String?)
        case serverError(String)

        public var errorDescription: String? {
            switch self {
            case .notConnected: "Not connected to the server."
            case .handshakeFailed(let reason): "Server refused the connection: \(reason)"
            case .closed(let reason?): "Connection closed: \(reason)"
            case .closed(nil): "Connection closed."
            case .serverError(let message): message
            }
        }
    }

    public typealias CloseHandler = @Sendable (Error?) -> Void

    private let url: URL
    private let transport: any HubTransport
    private let pingInterval: Duration

    private var buffer = Data()
    private var queued: [Data] = []
    private var pending: [String: CheckedContinuation<Data, Error>] = [:]
    private var handlers: [String: @Sendable (Data) -> Void] = [:]
    private var closeHandler: CloseHandler?
    private var nextInvocationId = 0
    private var receiveTask: Task<Void, Never>?
    private var pingTask: Task<Void, Never>?

    public private(set) var isConnected = false

    public init(url: URL, transport: any HubTransport = URLSessionWebSocketTransport(), pingInterval: Duration = .seconds(10)) {
        self.url = url
        self.transport = transport
        self.pingInterval = pingInterval
    }

    /// Registers a handler for a server-to-client method with a single argument.
    public func on<Argument: Decodable & Sendable>(
        _ method: String,
        _ type: Argument.Type,
        handler: @escaping @Sendable (Argument) -> Void
    ) {
        handlers[method] = { message in
            if let argument = try? SignalRProtocol.firstArgument(Argument.self, from: message) {
                handler(argument)
            }
        }
    }

    /// Called once when the connection ends: nil for a deliberate `stop()`, otherwise the reason.
    public func onClose(_ handler: @escaping CloseHandler) {
        closeHandler = handler
    }

    public func start() async throws {
        guard !isConnected else { return }
        buffer = Data()
        queued = []

        try await transport.connect(to: url)
        do {
            try await transport.send(SignalRProtocol.handshakeRequest)
            let handshake = try await nextMessage()
            if let error = try SignalRProtocol.handshakeError(in: handshake) {
                throw ConnectionError.handshakeFailed(error)
            }
        } catch {
            await transport.close()
            throw error
        }

        isConnected = true
        receiveTask = Task { await self.receiveLoop() }
        pingTask = Task { await self.pingLoop() }
    }

    public func stop() async {
        await finish(error: nil)
    }

    /// Invokes a hub method and waits for its result.
    public func invoke<Result: Decodable & Sendable>(
        _ method: String,
        _ arguments: any Encodable & Sendable...,
        returning type: Result.Type
    ) async throws -> Result {
        let message = try await invokeRaw(method, arguments)
        return try SignalRProtocol.completionResult(Result.self, from: message)
    }

    /// Invokes a hub method that returns nothing and waits until the server has run it.
    public func invoke(_ method: String, _ arguments: any Encodable & Sendable...) async throws {
        _ = try await invokeRaw(method, arguments)
    }

    private func invokeRaw(_ method: String, _ arguments: [any Encodable & Sendable]) async throws -> Data {
        guard isConnected else { throw ConnectionError.notConnected }
        nextInvocationId += 1
        let id = String(nextInvocationId)
        let frame = try SignalRProtocol.invocation(id: id, target: method, arguments: arguments)

        return try await withCheckedThrowingContinuation { continuation in
            pending[id] = continuation
            Task { await self.send(frame, failing: id) }
        }
    }

    private func send(_ frame: Data, failing invocationId: String) async {
        do {
            try await transport.send(frame)
        } catch {
            pending.removeValue(forKey: invocationId)?.resume(throwing: error)
        }
    }

    private func nextMessage() async throws -> Data {
        while queued.isEmpty {
            buffer.append(try await transport.receive())
            let (messages, remainder) = SignalRProtocol.split(buffer)
            queued.append(contentsOf: messages)
            buffer = remainder
        }
        return queued.removeFirst()
    }

    private func receiveLoop() async {
        while !Task.isCancelled && isConnected {
            do {
                handle(try await nextMessage())
            } catch {
                await finish(error: isConnected ? error : nil)
                return
            }
        }
    }

    private func pingLoop() async {
        while !Task.isCancelled && isConnected {
            try? await Task.sleep(for: pingInterval)
            guard !Task.isCancelled, isConnected else { return }
            try? await transport.send(SignalRProtocol.pingMessage)
        }
    }

    private func handle(_ message: Data) {
        switch SignalRProtocol.messageType(of: message) {
        case .completion:
            guard let completion = try? JSONDecoder().decode(SignalRProtocol.Completion.self, from: message),
                  let continuation = pending.removeValue(forKey: completion.invocationId) else { return }
            if let error = completion.error {
                continuation.resume(throwing: ConnectionError.serverError(Self.cleanServerError(error)))
            } else {
                continuation.resume(returning: message)
            }
        case .invocation:
            guard let header = try? SignalRProtocol.invocationHeader(of: message) else { return }
            handlers[header.target]?(message)
        case .close:
            let close = try? JSONDecoder().decode(SignalRProtocol.Close.self, from: message)
            Task { await self.finish(error: ConnectionError.closed(close?.error)) }
        case .ping, .streamItem, .streamInvocation, .cancelInvocation, nil:
            break
        }
    }

    private func finish(error: Error?) async {
        guard isConnected || !pending.isEmpty else { return }
        isConnected = false
        receiveTask?.cancel()
        pingTask?.cancel()
        receiveTask = nil
        pingTask = nil

        let failure = error ?? ConnectionError.closed(nil)
        let waiting = pending
        pending = [:]
        for continuation in waiting.values {
            continuation.resume(throwing: failure)
        }

        await transport.close()
        closeHandler?(error)
    }

    /// ASP.NET Core prefixes HubException messages; strip that so the UI can show them directly.
    static func cleanServerError(_ error: String) -> String {
        let prefix = "An unexpected error occurred invoking '"
        if error.hasPrefix(prefix), let range = error.range(of: "' on the server. HubException: ") {
            return String(error[range.upperBound...])
        }
        return error
    }
}
