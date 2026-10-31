import Foundation
import Testing
@testable import GameClient

/// A scripted in-memory server: answers the handshake and replies to invocations via `respond`.
actor FakeTransport: HubTransport {
    typealias Responder = @Sendable (_ target: String, _ invocationId: String?, _ message: Data) -> [String]

    private var inbox: [Data] = []
    private var waiter: CheckedContinuation<Data?, Never>?
    private var finished = false
    private let handshakeReply: String
    private let respond: Responder
    private(set) var sent: [Data] = []
    private(set) var closed = false

    init(handshakeReply: String = "{}", respond: @escaping Responder = { _, _, _ in [] }) {
        self.handshakeReply = handshakeReply
        self.respond = respond
    }

    func connect(to url: URL) async throws {}

    func send(_ data: Data) async throws {
        sent.append(data)
        for message in SignalRProtocol.split(data).messages {
            if SignalRProtocol.messageType(of: message) == nil {
                push(handshakeReply)
            } else if SignalRProtocol.messageType(of: message) == .invocation,
                      let header = try? SignalRProtocol.invocationHeader(of: message) {
                for reply in respond(header.target, header.invocationId, message) { push(reply) }
            }
        }
    }

    /// Simulates the server sending something on its own.
    func push(_ json: String) {
        let data = SignalRProtocol.frame(Data(json.utf8))
        if let waiter {
            self.waiter = nil
            waiter.resume(returning: data)
        } else {
            inbox.append(data)
        }
    }

    func receive() async throws -> Data {
        if !inbox.isEmpty { return inbox.removeFirst() }
        if finished { throw HubConnection.ConnectionError.closed(nil) }
        let next = await withCheckedContinuation { waiter = $0 }
        guard let next else { throw HubConnection.ConnectionError.closed(nil) }
        return next
    }

    func close() async {
        closed = true
        finished = true
        waiter?.resume(returning: nil)
        waiter = nil
    }
}

private let hubURL = URL(string: "ws://localhost:5080/hub/game")!

@Suite struct GameClientTests {
    @Test func joinRoomDecodesTheResponse() async throws {
        let transport = FakeTransport { target, id, _ in
            guard target == HubMethod.joinRoom, let id else { return [] }
            return [#"{"type":3,"invocationId":"\#(id)","result":{"playerId":"p1","roomCode":"ABCD","players":[{"playerId":"p1","displayName":"Léoke"}],"serverTimeMs":42}}"#]
        }
        let client = GameClient(hubURL: hubURL, transport: transport)
        try await client.connect()

        let response = try await client.joinRoom(code: "abcd", displayName: "Léoke")

        #expect(response.playerId == "p1")
        #expect(response.players == [PlayerDTO(playerId: "p1", displayName: "Léoke")])
        await client.disconnect()
        #expect(await transport.closed)
    }

    @Test func serverErrorsSurfaceAsReadableMessages() async throws {
        let transport = FakeTransport { _, id, _ in
            guard let id else { return [] }
            return [#"{"type":3,"invocationId":"\#(id)","error":"Room code must be 4 to 8 letters or digits."}"#]
        }
        let client = GameClient(hubURL: hubURL, transport: transport)
        try await client.connect()

        await #expect(throws: HubConnection.ConnectionError.serverError("Room code must be 4 to 8 letters or digits.")) {
            _ = try await client.joinRoom(code: "x", displayName: "Léoke")
        }
        await client.disconnect()
    }

    @Test func rosterEventsArriveOnTheStream() async throws {
        let transport = FakeTransport()
        let client = GameClient(hubURL: hubURL, transport: transport)
        try await client.connect()

        await transport.push(#"{"type":1,"target":"RosterChanged","arguments":[{"roomCode":"ABCD","players":[{"playerId":"p2","displayName":"Ralph"}]}]}"#)

        var iterator = client.events.makeAsyncIterator()
        let event = await iterator.next()
        #expect(event == .rosterChanged(RosterChangedEvent(roomCode: "ABCD", players: [PlayerDTO(playerId: "p2", displayName: "Ralph")])))
        await client.disconnect()
    }

    @Test func serverCloseIsReportedAndFailsPendingCalls() async throws {
        let transport = FakeTransport()
        let client = GameClient(hubURL: hubURL, transport: transport)
        try await client.connect()

        await transport.push(#"{"type":7,"error":"Server shutting down"}"#)

        var iterator = client.events.makeAsyncIterator()
        let event = await iterator.next()
        #expect(event == .disconnected(reason: "Connection closed: Server shutting down"))
        await #expect(throws: HubConnection.ConnectionError.notConnected) {
            _ = try await client.joinRoom(code: "ABCD", displayName: "Léoke")
        }
    }

    @Test func handshakeErrorFailsConnect() async throws {
        let transport = FakeTransport(handshakeReply: #"{"error":"Unsupported protocol"}"#)
        let client = GameClient(hubURL: hubURL, transport: transport)

        await #expect(throws: HubConnection.ConnectionError.handshakeFailed("Unsupported protocol")) {
            try await client.connect()
        }
        #expect(await transport.closed)
    }
}
