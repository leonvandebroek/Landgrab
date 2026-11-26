import Foundation

public enum HubURL {
    public static let defaultPath = "/hub/game"

    /// Turns what a player types into a WebSocket hub URL.
    ///
    /// Accepts `192.168.1.20:5080`, `http://mac.local:5080`, `https://abc.devtunnels.ms` or a full
    /// `ws(s)://.../hub/game`. http becomes ws, https becomes wss, and a missing path becomes `/hub/game`.
    public static func make(from input: String) -> URL? {
        var text = input.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return nil }
        if !text.contains("://") {
            text = "ws://" + text
        }
        guard var components = URLComponents(string: text), let host = components.host, !host.isEmpty else {
            return nil
        }

        switch components.scheme?.lowercased() {
        case "http", "ws": components.scheme = "ws"
        case "https", "wss": components.scheme = "wss"
        default: return nil
        }

        if components.path.isEmpty || components.path == "/" {
            components.path = defaultPath
        }
        return components.url
    }
}
