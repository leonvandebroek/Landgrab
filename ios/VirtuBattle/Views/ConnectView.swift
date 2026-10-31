import SwiftUI

struct ConnectView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        @Bindable var model = model

        NavigationStack {
            Form {
                Section {
                    TextField("192.168.1.20:5080", text: $model.serverAddress)
                        .keyboardType(.URL)
                        .textContentType(.URL)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                } header: {
                    Text("Server")
                } footer: {
                    Text("Your Mac's address and port while developing, or a dev tunnel URL.")
                }

                Section("Player") {
                    TextField("Your name", text: $model.displayName)
                        .textContentType(.nickname)
                    TextField("Room code (4 to 8 letters or digits)", text: $model.roomCode)
                        .textInputAutocapitalization(.characters)
                        .autocorrectionDisabled()
                }

                Section {
                    Button {
                        Task { await model.join() }
                    } label: {
                        HStack {
                            Text("Join room")
                            Spacer()
                            if model.phase == .connecting {
                                ProgressView()
                            }
                        }
                    }
                    .disabled(!model.canJoin)
                }

                if let error = model.errorMessage {
                    Section {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("VirtuBattle")
        }
    }
}

#Preview {
    ConnectView()
        .environment(AppModel(defaults: UserDefaults(suiteName: "preview")!))
}
