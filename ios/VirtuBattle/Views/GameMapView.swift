import CoreLocation
import GameClient
import MapKit
import SwiftUI

/// M1: you and the other players on a live map, with a debug panel for field testing.
struct GameMapView: View {
    @Environment(AppModel.self) private var model
    @State private var camera: MapCameraPosition = .userLocation(fallback: .automatic)

    var body: some View {
        NavigationStack {
            Map(position: $camera) {
                UserAnnotation()

                ForEach(locatedPlayers) { located in
                    MapCircle(center: located.coordinate, radius: max(located.accuracy, 1))
                        .foregroundStyle(.orange.opacity(0.15))
                        .stroke(.orange.opacity(0.5), lineWidth: 1)
                    Annotation(located.name, coordinate: located.coordinate) {
                        PlayerMarker()
                    }
                }
            }
            .mapStyle(.standard(pointsOfInterest: .excludingAll))
            .mapControls {
                MapUserLocationButton()
                MapCompass()
                MapScaleView()
            }
            .safeAreaInset(edge: .bottom) {
                StatusPanel()
            }
            .navigationTitle("Room \(model.joinedRoomCode ?? "")")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Leave", role: .destructive) {
                        Task { await model.leave() }
                    }
                }
            }
            .overlay(alignment: .top) {
                if model.locationDenied {
                    LocationDeniedBanner()
                }
            }
        }
    }
}

private struct LocatedPlayer: Identifiable {
    let id: String
    let name: String
    let coordinate: CLLocationCoordinate2D
    let accuracy: Double
}

extension GameMapView {
    private var locatedPlayers: [LocatedPlayer] {
        model.otherPlayers.compactMap { other in
            other.position.map {
                LocatedPlayer(id: other.id, name: other.player.displayName, coordinate: $0.coordinate, accuracy: $0.horizontalAccuracy)
            }
        }
    }
}

private struct PlayerMarker: View {
    var body: some View {
        Image(systemName: "figure.run.circle.fill")
            .font(.title)
            .symbolRenderingMode(.palette)
            .foregroundStyle(.white, .orange)
            .shadow(radius: 2)
    }
}

private struct LocationDeniedBanner: View {
    var body: some View {
        VStack(spacing: 8) {
            Text("VirtuBattle needs your location to put you on the map.")
                .multilineTextAlignment(.center)
            Button("Open Settings") {
                if let url = URL(string: UIApplication.openSettingsURLString) {
                    UIApplication.shared.open(url)
                }
            }
            .buttonStyle(.borderedProminent)
        }
        .padding()
        .background(.regularMaterial, in: .rect(cornerRadius: 12))
        .padding()
    }
}

/// Field-test readout: rate mode, own accuracy, and how fresh each other player's dot is.
private struct StatusPanel: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        TimelineView(.periodic(from: .now, by: 0.5)) { context in
            VStack(alignment: .leading, spacing: 6) {
                HStack {
                    Label(modeTitle, systemImage: modeSymbol)
                        .font(.headline)
                    Spacer()
                    if let mode = model.rateMode {
                        Text("every \(Self.seconds(mode.interval))")
                            .foregroundStyle(.secondary)
                    }
                }

                HStack(spacing: 12) {
                    if let fix = model.myFix {
                        Text("GPS ±\(Int(fix.horizontalAccuracy.rounded())) m")
                    } else {
                        Text("Waiting for GPS…")
                    }
                    Text("sent \(model.positionsSent)")
                    if let ms = model.roundTripMs {
                        Text("RTT \(ms) ms")
                    }
                }
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)

                if model.otherPlayers.isEmpty {
                    Text("Waiting for a second player to join with the same room code.")
                        .font(.subheadline)
                } else {
                    ForEach(model.otherPlayers) { other in
                        OtherPlayerRow(other: other, now: context.date)
                    }
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.regularMaterial, in: .rect(cornerRadius: 16))
            .padding(.horizontal)
            .padding(.bottom, 4)
        }
    }

    private var modeTitle: String {
        switch model.rateMode?.mode {
        case .idle, nil: String(localized: "Idle")
        case .roaming: String(localized: "Roaming")
        case .engaged: String(localized: "Engaged")
        case .closeCombat: String(localized: "Close combat")
        }
    }

    private var modeSymbol: String {
        switch model.rateMode?.mode {
        case .idle, nil: "moon.zzz"
        case .roaming: "figure.walk"
        case .engaged: "scope"
        case .closeCombat: "bolt.fill"
        }
    }

    static func seconds(_ interval: TimeInterval) -> String {
        interval < 1 ? "\(Int(interval * 1000)) ms" : "\(Int(interval)) s"
    }
}

private struct OtherPlayerRow: View {
    let other: AppModel.OtherPlayer
    let now: Date

    var body: some View {
        HStack {
            Image(systemName: "person.fill")
                .foregroundStyle(.orange)
            Text(other.player.displayName)
            Spacer()
            if let distance = other.distance {
                Text(Self.format(distance))
                    .monospacedDigit()
            }
            Text(ageText)
                .font(.caption.monospacedDigit())
                .foregroundStyle(isStale ? Color.red : Color.secondary)
        }
        .font(.subheadline)
    }

    private var age: TimeInterval? {
        other.receivedAt.map { now.timeIntervalSince($0) }
    }

    private var isStale: Bool { (age ?? 0) > 15 }

    private var ageText: String {
        guard let age else { return String(localized: "no position yet") }
        return age < 1 ? String(localized: "now") : String(localized: "\(Int(age)) s ago")
    }

    static func format(_ meters: Double) -> String {
        meters < 1000 ? "\(Int(meters.rounded())) m" : String(format: "%.1f km", meters / 1000)
    }
}

extension PlayerPositionDTO {
    var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
}

#Preview {
    GameMapView()
        .environment(AppModel(defaults: UserDefaults(suiteName: "preview")!, makeLocationSource: { CoreLocationSource() }))
}
