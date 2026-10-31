import Foundation

/// The app-facing game connection: typed hub calls plus a stream of server events.
public actor GameClient {
    public enum Event: Sendable, Equatable {
        case rosterChanged(RosterChangedEvent)
        case disconnected(reason: String?)
    }

    /// Server events. Finishes when `disconnect()` is called.
    public nonisolated let events: AsyncStream<Event>

    private let continuation: AsyncStream<Event>.Continuation
    private let hub: HubConnection

    public init(hubURL: URL, transport: any HubTransport = URLSessionWebSocketTransport()) {
        (events, continuation) = AsyncStream.makeStream(of: Event.self, bufferingPolicy: .bufferingNewest(32))
        hub = HubConnection(url: hubURL, transport: transport)
    }

    public func connect() async throws {
        let continuation = self.continuation
        await hub.on(HubMethod.rosterChanged, RosterChangedEvent.self) { event in
            continuation.yield(.rosterChanged(event))
        }
        await hub.onClose { error in
            guard let error else { return }
            continuation.yield(.disconnected(reason: error.localizedDescription))
        }
        try await hub.start()
    }

    public func joinRoom(code: String, displayName: String) async throws -> JoinRoomResponse {
        try await hub.invoke(HubMethod.joinRoom, code, displayName, returning: JoinRoomResponse.self)
    }

    public func leaveRoom() async throws {
        try await hub.invoke(HubMethod.leaveRoom)
    }

    /// Measures one round trip to the server.
    public func measureRoundTrip() async throws -> Duration {
        let clock = ContinuousClock()
        let start = clock.now
        let sentMs = Int64(Date().timeIntervalSince1970 * 1000)
        _ = try await hub.invoke(HubMethod.ping, sentMs, returning: PongResponse.self)
        return clock.now - start
    }

    public func disconnect() async {
        await hub.stop()
        continuation.finish()
    }
}
