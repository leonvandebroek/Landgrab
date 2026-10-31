import Foundation
#if canImport(FoundationNetworking)
import FoundationNetworking
#endif

/// A message-based connection to the server. Abstracted so tests can run the hub client against a fake.
public protocol HubTransport: Sendable {
    func connect(to url: URL) async throws
    func send(_ data: Data) async throws
    /// Waits for the next chunk of data from the server. Throws when the connection ends.
    func receive() async throws -> Data
    func close() async
}

/// WebSocket transport on URLSession. Connects straight to `ws(s)://host/hub/game`, skipping the SignalR
/// negotiate step, which ASP.NET Core allows when the client only uses WebSockets.
public actor URLSessionWebSocketTransport: HubTransport {
    private let session: URLSession
    private var task: URLSessionWebSocketTask?

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public func connect(to url: URL) async throws {
        let task = session.webSocketTask(with: url)
        self.task = task
        task.resume()
    }

    public func send(_ data: Data) async throws {
        guard let task else { throw HubConnection.ConnectionError.notConnected }
        // SignalR's JSON protocol travels in text frames.
        try await task.send(.string(String(decoding: data, as: UTF8.self)))
    }

    public func receive() async throws -> Data {
        guard let task else { throw HubConnection.ConnectionError.notConnected }
        switch try await task.receive() {
        case .string(let text):
            return Data(text.utf8)
        case .data(let data):
            return data
        @unknown default:
            return Data()
        }
    }

    public func close() async {
        task?.cancel(with: .normalClosure, reason: nil)
        task = nil
    }
}
