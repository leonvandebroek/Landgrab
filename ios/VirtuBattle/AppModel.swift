import AimingEngine
import Foundation
import GameClient
import Observation

/// App state: connect to the hub and join a room (M0), then share positions and follow the
/// server's rate mode (M1).
@MainActor
@Observable
final class AppModel {
    enum Phase: Equatable {
        case idle
        case connecting
        case inRoom
    }

    /// Another player as the map and status panel show them.
    struct OtherPlayer: Identifiable, Equatable {
        let player: PlayerDTO
        let position: PlayerPositionDTO?
        /// When this phone received the last position.
        let receivedAt: Date?
        /// Distance from my last fix, in meters.
        let distance: Double?

        var id: String { player.playerId }
    }

    var serverAddress: String {
        didSet { defaults.set(serverAddress, forKey: Keys.serverAddress) }
    }

    var displayName: String {
        didSet { defaults.set(displayName, forKey: Keys.displayName) }
    }

    var roomCode: String {
        didSet { defaults.set(roomCode, forKey: Keys.roomCode) }
    }

    var errorMessage: String?

    private(set) var phase: Phase = .idle
    private(set) var players: [PlayerDTO] = []
    private(set) var myPlayerId: String?
    private(set) var joinedRoomCode: String?
    private(set) var roundTripMs: Int?

    private(set) var myFix: LocationFix?
    private(set) var locationDenied = false
    private(set) var rateMode: RateModeChangedEvent?
    private(set) var positionsSent = 0
    private(set) var positions: [String: PlayerPositionDTO] = [:]
    private(set) var receivedAt: [String: Date] = [:]

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let makeLocationSource: @MainActor () -> any LocationSource
    @ObservationIgnored private var locationSource: (any LocationSource)?
    @ObservationIgnored private var client: GameClient?
    @ObservationIgnored private var eventsTask: Task<Void, Never>?
    @ObservationIgnored private var latencyTask: Task<Void, Never>?
    @ObservationIgnored private var locationTask: Task<Void, Never>?
    @ObservationIgnored private var throttle = PositionThrottle(interval: 10)

    private enum Keys {
        static let serverAddress = "serverAddress"
        static let displayName = "displayName"
        static let roomCode = "roomCode"
    }

    init(defaults: UserDefaults = .standard, makeLocationSource: @escaping @MainActor () -> any LocationSource) {
        self.defaults = defaults
        self.makeLocationSource = makeLocationSource
        serverAddress = defaults.string(forKey: Keys.serverAddress) ?? ""
        displayName = defaults.string(forKey: Keys.displayName) ?? ""
        roomCode = defaults.string(forKey: Keys.roomCode) ?? ""
    }

    var hubURL: URL? { HubURL.make(from: serverAddress) }

    var canJoin: Bool {
        phase == .idle
            && hubURL != nil
            && !displayName.trimmingCharacters(in: .whitespaces).isEmpty
            && roomCode.trimmingCharacters(in: .whitespaces).count >= 4
    }

    /// Everyone in the room except me, nearest first, players without a position last.
    var otherPlayers: [OtherPlayer] {
        players
            .filter { $0.playerId != myPlayerId }
            .map { player in
                let position = positions[player.playerId]
                return OtherPlayer(
                    player: player,
                    position: position,
                    receivedAt: receivedAt[player.playerId],
                    distance: position.flatMap(distanceFromMe))
            }
            .sorted { ($0.distance ?? .infinity, $0.player.displayName) < ($1.distance ?? .infinity, $1.player.displayName) }
    }

    func join() async {
        guard let url = hubURL else {
            errorMessage = String(localized: "That server address doesn't look right.")
            return
        }

        phase = .connecting
        errorMessage = nil
        let client = GameClient(hubURL: url)
        self.client = client

        do {
            try await client.connect()
            listen(to: client)
            let response = try await client.joinRoom(code: roomCode, displayName: displayName)
            myPlayerId = response.playerId
            joinedRoomCode = response.roomCode
            players = response.players
            let now = Date()
            for position in response.positions where position.playerId != response.playerId {
                positions[position.playerId] = position
                receivedAt[position.playerId] = now
            }
            apply(response.rateMode)
            phase = .inRoom
            probeLatency(with: client)
            shareLocation(with: client)
        } catch {
            await reset()
            errorMessage = error.localizedDescription
        }
    }

    func leave() async {
        try? await client?.leaveRoom()
        await reset()
    }

    private func listen(to client: GameClient) {
        eventsTask = Task { [weak self] in
            for await event in client.events {
                guard let self else { return }
                switch event {
                case .rosterChanged(let roster):
                    guard joinedRoomCode == nil || roster.roomCode == joinedRoomCode else { break }
                    players = roster.players
                    let present = Set(roster.players.map(\.playerId))
                    positions = positions.filter { present.contains($0.key) }
                    receivedAt = receivedAt.filter { present.contains($0.key) }
                case .playerMoved(let position):
                    positions[position.playerId] = position
                    receivedAt[position.playerId] = Date()
                case .rateModeChanged(let mode):
                    apply(mode)
                case .disconnected(let reason):
                    await reset()
                    errorMessage = reason ?? String(localized: "Lost the connection to the server.")
                    return
                }
            }
        }
    }

    private func apply(_ mode: RateModeChangedEvent) {
        rateMode = mode
        throttle.setInterval(mode.interval)
    }

    private func shareLocation(with client: GameClient) {
        let source = makeLocationSource()
        locationSource = source
        throttle.reset()
        locationTask = Task { [weak self] in
            for await event in source.events() {
                guard let self, !Task.isCancelled else { return }
                switch event {
                case .denied:
                    locationDenied = true
                case .fix(let fix):
                    locationDenied = false
                    myFix = fix
                    guard throttle.shouldSend(at: ProcessInfo.processInfo.systemUptime) else { continue }
                    let update = PositionUpdate(
                        latitude: fix.latitude,
                        longitude: fix.longitude,
                        horizontalAccuracy: fix.horizontalAccuracy,
                        timestampMs: Int64(fix.timestamp.timeIntervalSince1970 * 1000))
                    if (try? await client.sendPosition(update)) != nil {
                        positionsSent += 1
                    }
                }
            }
        }
    }

    private func probeLatency(with client: GameClient) {
        latencyTask = Task { [weak self] in
            while !Task.isCancelled {
                if let roundTrip = try? await client.measureRoundTrip() {
                    let (seconds, attoseconds) = roundTrip.components
                    self?.roundTripMs = Int(seconds * 1000 + attoseconds / 1_000_000_000_000_000)
                }
                try? await Task.sleep(for: .seconds(3))
            }
        }
    }

    private func distanceFromMe(_ position: PlayerPositionDTO) -> Double? {
        guard let myFix else { return nil }
        return GeoMath.distance(
            from: GeoPoint(latitude: myFix.latitude, longitude: myFix.longitude),
            to: GeoPoint(latitude: position.latitude, longitude: position.longitude))
    }

    private func reset() async {
        eventsTask?.cancel()
        latencyTask?.cancel()
        locationTask?.cancel()
        eventsTask = nil
        latencyTask = nil
        locationTask = nil
        locationSource = nil
        let client = self.client
        self.client = nil
        await client?.disconnect()
        phase = .idle
        players = []
        myPlayerId = nil
        joinedRoomCode = nil
        roundTripMs = nil
        myFix = nil
        rateMode = nil
        positionsSent = 0
        positions = [:]
        receivedAt = [:]
    }
}
