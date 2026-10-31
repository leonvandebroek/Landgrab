import Foundation

// Wire contracts for the game hub. These mirror server/VirtuBattle.Server/Hubs/GameContracts.cs
// (JSON is camelCase on both sides). Keep both in sync.

public struct PlayerDTO: Codable, Sendable, Hashable, Identifiable {
    public let playerId: String
    public let displayName: String

    public var id: String { playerId }

    public init(playerId: String, displayName: String) {
        self.playerId = playerId
        self.displayName = displayName
    }
}

public struct JoinRoomResponse: Codable, Sendable, Hashable {
    public let playerId: String
    public let roomCode: String
    public let players: [PlayerDTO]
    public let serverTimeMs: Int64
}

public struct RosterChangedEvent: Codable, Sendable, Hashable {
    public let roomCode: String
    public let players: [PlayerDTO]
}

public struct PongResponse: Codable, Sendable, Hashable {
    public let clientTimeMs: Int64
    public let serverTimeMs: Int64
}

/// Hub method names, client to server and server to client.
public enum HubMethod {
    public static let joinRoom = "JoinRoom"
    public static let leaveRoom = "LeaveRoom"
    public static let ping = "Ping"
    public static let rosterChanged = "RosterChanged"
}
