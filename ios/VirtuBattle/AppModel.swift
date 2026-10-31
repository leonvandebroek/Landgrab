import Foundation
import GameClient
import Observation

/// App state for M0: connect to the hub, join a room, show who else is there.
@MainActor
@Observable
final class AppModel {
    enum Phase: Equatable {
        case idle
        case connecting
        case inRoom
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

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private var client: GameClient?
    @ObservationIgnored private var eventsTask: Task<Void, Never>?
    @ObservationIgnored private var latencyTask: Task<Void, Never>?

    private enum Keys {
        static let serverAddress = "serverAddress"
        static let displayName = "displayName"
        static let roomCode = "roomCode"
    }

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
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
            phase = .inRoom
            probeLatency(with: client)
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
                    if joinedRoomCode == nil || roster.roomCode == joinedRoomCode {
                        players = roster.players
                    }
                case .disconnected(let reason):
                    await reset()
                    errorMessage = reason ?? String(localized: "Lost the connection to the server.")
                    return
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

    private func reset() async {
        eventsTask?.cancel()
        latencyTask?.cancel()
        eventsTask = nil
        latencyTask = nil
        let client = self.client
        self.client = nil
        await client?.disconnect()
        phase = .idle
        players = []
        myPlayerId = nil
        joinedRoomCode = nil
        roundTripMs = nil
    }
}
