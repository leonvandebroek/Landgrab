import SwiftUI

@main
struct VirtuBattleApp: App {
    @State private var model = AppModel()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(model)
        }
    }
}

struct RootView: View {
    @Environment(AppModel.self) private var model

    var body: some View {
        switch model.phase {
        case .idle, .connecting:
            ConnectView()
        case .inRoom:
            LobbyView()
        }
    }
}
