import Foundation

/// The parts of the SignalR JSON hub protocol that VirtuBattle uses, as pure functions.
///
/// Every message is a JSON object followed by the record separator 0x1E. The client first sends a
/// handshake, the server answers `{}` (or `{"error":"..."}`), then both sides exchange typed messages.
/// Spec: https://github.com/dotnet/aspnetcore/blob/main/src/SignalR/docs/specs/HubProtocol.md
public enum SignalRProtocol {
    public static let recordSeparator: UInt8 = 0x1E

    public enum MessageType: Int, Sendable {
        case invocation = 1
        case streamItem = 2
        case completion = 3
        case streamInvocation = 4
        case cancelInvocation = 5
        case ping = 6
        case close = 7
    }

    public static var handshakeRequest: Data {
        frame(Data(#"{"protocol":"json","version":1}"#.utf8))
    }

    public static var pingMessage: Data {
        frame(Data(#"{"type":6}"#.utf8))
    }

    public static func frame(_ json: Data) -> Data {
        var data = json
        data.append(recordSeparator)
        return data
    }

    /// Splits a buffer into complete messages (separator removed) and the incomplete remainder.
    public static func split(_ buffer: Data) -> (messages: [Data], remainder: Data) {
        var messages: [Data] = []
        var start = buffer.startIndex
        for index in buffer.indices where buffer[index] == recordSeparator {
            if index > start {
                messages.append(Data(buffer[start..<index]))
            }
            start = buffer.index(after: index)
        }
        return (messages, Data(buffer[start..<buffer.endIndex]))
    }

    public static func messageType(of message: Data) -> MessageType? {
        struct Envelope: Decodable { let type: Int }
        guard let envelope = try? JSONDecoder().decode(Envelope.self, from: message) else { return nil }
        return MessageType(rawValue: envelope.type)
    }

    /// Returns the server's handshake error, or nil when the handshake succeeded.
    public static func handshakeError(in message: Data) throws -> String? {
        struct Handshake: Decodable { let error: String? }
        return try JSONDecoder().decode(Handshake.self, from: message).error
    }

    public static func invocation(id: String?, target: String, arguments: [any Encodable & Sendable]) throws -> Data {
        let message = InvocationMessage(invocationId: id, target: target, arguments: arguments.map(AnyEncodable.init))
        return frame(try JSONEncoder().encode(message))
    }

    public struct Completion: Decodable, Sendable {
        public let invocationId: String
        public let error: String?
    }

    public struct Close: Decodable, Sendable {
        public let error: String?
        public let allowReconnect: Bool?
    }

    /// Decodes the `result` of a completion message.
    public static func completionResult<Result: Decodable>(_ type: Result.Type, from message: Data) throws -> Result {
        try JSONDecoder().decode(CompletionEnvelope<Result>.self, from: message).result
    }

    /// The target name and invocation id of an invocation message.
    public static func invocationHeader(of message: Data) throws -> (target: String, invocationId: String?) {
        struct Header: Decodable { let target: String; let invocationId: String? }
        let header = try JSONDecoder().decode(Header.self, from: message)
        return (header.target, header.invocationId)
    }

    /// Decodes the single argument of a server-to-client invocation.
    public static func firstArgument<Argument: Decodable>(_ type: Argument.Type, from message: Data) throws -> Argument {
        let arguments = try JSONDecoder().decode(ArgumentsEnvelope<Argument>.self, from: message).arguments
        guard let first = arguments.first else {
            throw DecodingError.valueNotFound(Argument.self, .init(codingPath: [], debugDescription: "No arguments"))
        }
        return first
    }
}

private struct CompletionEnvelope<Result: Decodable>: Decodable {
    let result: Result
}

private struct ArgumentsEnvelope<Argument: Decodable>: Decodable {
    let arguments: [Argument]
}

private struct InvocationMessage: Encodable {
    let type = SignalRProtocol.MessageType.invocation.rawValue
    let invocationId: String?
    let target: String
    let arguments: [AnyEncodable]

    enum CodingKeys: String, CodingKey { case type, invocationId, target, arguments }

    func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(type, forKey: .type)
        try container.encodeIfPresent(invocationId, forKey: .invocationId)
        try container.encode(target, forKey: .target)
        try container.encode(arguments, forKey: .arguments)
    }
}

private struct AnyEncodable: Encodable {
    let value: any Encodable

    func encode(to encoder: any Encoder) throws {
        try value.encode(to: encoder)
    }
}
