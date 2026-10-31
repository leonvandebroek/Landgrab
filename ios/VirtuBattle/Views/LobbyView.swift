import SwiftUI

struct LobbyView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(model.players) { player in
                        HStack {
                            Image(systemName: "person.fill")
                                .foregroundStyle(.tint)
                            Text(player.displayName)
                            Spacer()
                            if player.playerId == model.myPlayerId {
                                Text("You")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                } header: {
                    Text("Players (\(model.players.count))")
                } footer: {
                    if model.players.count < 2 {
                        Text("Waiting for a second player to join with the same room code.")
                    }
                }

                Section("Connection") {
                    LabeledContent("Round trip") {
                        if let ms = model.roundTripMs {
                            Text("\(ms) ms")
                        } else {
                            ProgressView()
                        }
                    }
                }

                Section {
                    Button("Leave room", role: .destructive) {
                        Task { await model.leave() }
                    }
                }
            }
            .navigationTitle("Room \(model.joinedRoomCode ?? "")")
        }
    }
}
