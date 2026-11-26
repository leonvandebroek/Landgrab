import Foundation
import Testing
@testable import GameClient

@Suite struct SignalRProtocolTests {
    @Test func handshakeIsFramed() {
        let handshake = SignalRProtocol.handshakeRequest
        #expect(handshake.last == SignalRProtocol.recordSeparator)
        #expect(String(decoding: handshake.dropLast(), as: UTF8.self) == #"{"protocol":"json","version":1}"#)
    }

    @Test func splitKeepsIncompleteRemainder() {
        let buffer = Data("{\"a\":1}\u{1e}{\"b\":2}\u{1e}{\"c\"".utf8)
        let (messages, remainder) = SignalRProtocol.split(buffer)
        #expect(messages.map { String(decoding: $0, as: UTF8.self) } == [#"{"a":1}"#, #"{"b":2}"#])
        #expect(String(decoding: remainder, as: UTF8.self) == #"{"c""#)
    }

    @Test func splitOfEmptyBufferIsEmpty() {
        let (messages, remainder) = SignalRProtocol.split(Data())
        #expect(messages.isEmpty)
        #expect(remainder.isEmpty)
    }

    @Test func invocationEncodesTargetAndArguments() throws {
        let frame = try SignalRProtocol.invocation(id: "7", target: "JoinRoom", arguments: ["ABCD", "Léoke"])
        let json = try JSONSerialization.jsonObject(with: frame.dropLast()) as? [String: Any]
        #expect(json?["type"] as? Int == 1)
        #expect(json?["invocationId"] as? String == "7")
        #expect(json?["target"] as? String == "JoinRoom")
        #expect(json?["arguments"] as? [String] == ["ABCD", "Léoke"])
    }

    @Test func messageTypeIsRead() {
        #expect(SignalRProtocol.messageType(of: Data(#"{"type":6}"#.utf8)) == .ping)
        #expect(SignalRProtocol.messageType(of: Data(#"{}"#.utf8)) == nil)
    }

    @Test func handshakeErrorIsReported() throws {
        #expect(try SignalRProtocol.handshakeError(in: Data("{}".utf8)) == nil)
        #expect(try SignalRProtocol.handshakeError(in: Data(#"{"error":"nope"}"#.utf8)) == "nope")
    }

    @Test func serverErrorPrefixIsStripped() {
        let raw = "An unexpected error occurred invoking 'JoinRoom' on the server. HubException: Room code must be 4 to 8 letters or digits."
        #expect(HubConnection.cleanServerError(raw) == "Room code must be 4 to 8 letters or digits.")
        #expect(HubConnection.cleanServerError("Plain") == "Plain")
    }
}
