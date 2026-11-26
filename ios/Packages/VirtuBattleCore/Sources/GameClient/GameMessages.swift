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
    /// Last known positions of players already in the room.
    public let positions: [PlayerPositionDTO]
    /// Your starting rate mode (idle until someone else has a position).
    public let rateMode: RateModeChangedEvent
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

/// How often the server wants this phone to send its position, by distance to the nearest opponent.
public enum RateMode: String, Codable, Sendable, CaseIterable {
    case idle
    case roaming
    case engaged
    case closeCombat
}

public struct RateModeChangedEvent: Codable, Sendable, Hashable {
    public let mode: RateMode
    public let intervalMs: Int
    public let nearestDistanceMeters: Double?

    public init(mode: RateMode, intervalMs: Int, nearestDistanceMeters: Double?) {
        self.mode = mode
        self.intervalMs = intervalMs
        self.nearestDistanceMeters = nearestDistanceMeters
    }
}

/// A position fix sent to the server. `timestampMs` is when the fix was taken (Unix ms, phone clock).
public struct PositionUpdate: Codable, Sendable, Hashable {
    public let latitude: Double
    public let longitude: Double
    public let horizontalAccuracy: Double
    public let timestampMs: Int64

    public init(latitude: Double, longitude: Double, horizontalAccuracy: Double, timestampMs: Int64) {
        self.latitude = latitude
        self.longitude = longitude
        self.horizontalAccuracy = horizontalAccuracy
        self.timestampMs = timestampMs
    }
}

/// Another player's position as relayed by the server. `serverTimeMs` is when the server received it.
public struct PlayerPositionDTO: Codable, Sendable, Hashable {
    public let playerId: String
    public let latitude: Double
    public let longitude: Double
    public let horizontalAccuracy: Double
    public let timestampMs: Int64
    public let serverTimeMs: Int64

    public init(playerId: String, latitude: Double, longitude: Double, horizontalAccuracy: Double, timestampMs: Int64, serverTimeMs: Int64) {
        self.playerId = playerId
        self.latitude = latitude
        self.longitude = longitude
        self.horizontalAccuracy = horizontalAccuracy
        self.timestampMs = timestampMs
        self.serverTimeMs = serverTimeMs
    }
}

/// Hub method names, client to server and server to client.
public enum HubMethod {
    public static let joinRoom = "JoinRoom"
    public static let leaveRoom = "LeaveRoom"
    public static let ping = "Ping"
    public static let updatePosition = "UpdatePosition"
    public static let rosterChanged = "RosterChanged"
    public static let playerMoved = "PlayerMoved"
    public static let rateModeChanged = "RateModeChanged"
}
