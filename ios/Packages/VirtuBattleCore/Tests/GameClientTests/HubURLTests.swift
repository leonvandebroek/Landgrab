import Testing
@testable import GameClient

@Suite struct HubURLTests {
    @Test(arguments: [
        ("192.168.1.20:5080", "ws://192.168.1.20:5080/hub/game"),
        ("  leons-mac.local:5080 ", "ws://leons-mac.local:5080/hub/game"),
        ("http://leons-mac.local:5080/", "ws://leons-mac.local:5080/hub/game"),
        ("https://abc-5080.euw.devtunnels.ms", "wss://abc-5080.euw.devtunnels.ms/hub/game"),
        ("wss://game.example.com/hub/game", "wss://game.example.com/hub/game"),
    ])
    func normalizesInput(input: String, expected: String) {
        #expect(HubURL.make(from: input)?.absoluteString == expected)
    }

    @Test(arguments: ["", "   ", "ftp://example.com", "ws://"])
    func rejectsInvalidInput(input: String) {
        #expect(HubURL.make(from: input) == nil)
    }
}
