# VirtuBattle iOS (proof of concept)

SwiftUI app for iOS 18+. M0: connect to the game server and join a room with a code. M1: everyone
in the room on a live map, with the server choosing how often each phone sends its position.

```
ios/
├── project.yml                 XcodeGen spec (the .xcodeproj is generated, not committed)
├── Config/                     Signing.xcconfig + your git-ignored Local.xcconfig
├── VirtuBattle/                App target: SwiftUI views, AppModel, Core Location source
└── Packages/VirtuBattleCore/   UI-free logic with unit tests
    ├── GameClient              Minimal SignalR client (JSON over WebSockets), hub messages, send throttle
    └── AimingEngine            Distance, bearing and the aiming cone (used from M2)
```

## First run on your Mac

1. Install the tools (once): Xcode from the App Store, then `brew install xcodegen`.
2. Signing (once): `cp Config/Local.xcconfig.example Config/Local.xcconfig` and set your
   `DEVELOPMENT_TEAM` (Xcode > Settings > Accounts, or developer.apple.com > Membership).
3. Generate and open the project:

   ```bash
   cd ios
   xcodegen generate
   open VirtuBattle.xcodeproj
   ```

   Run `xcodegen generate` again whenever files are added or `project.yml` changes.
4. Start the server (see `server/README.md`): `cd server/VirtuBattle.Server && dotnet run`.
   It listens on port 5080 on all network interfaces.
5. Plug in your iPhone (enable Developer Mode on it when asked), pick it as the run destination,
   press Run.
6. In the app, enter your Mac's address, for example `leons-mac.local:5080` or its Wi-Fi IP
   (`ipconfig getifaddr en0`), a name and a room code, then tap **Join room**. Allow local network
   access when iOS asks.

A second phone, or the iOS Simulator on the Mac, can join the same room code. Allow location
access when asked.

## Testing M1 (see each other on the map)

The panel at the bottom of the map is the field-test readout: your rate mode and send interval,
your GPS accuracy, how many positions you sent, the round trip, and for each other player their
distance and how long ago their last position arrived (red after 15 s).

1. **At your desk, with the Simulator as player two.** Run on your iPhone and in the Simulator with
   the same room code. In the Simulator pick Features > Location > City Run (or a custom
   location). You should see the Simulator's runner move on your phone, and both panels switch
   from Idle to Roaming, Engaged or Close combat depending on the distance.
2. **Outside, with two phones** (M1 exit test): walk about 200 m apart and back. The other dot
   should never lag more than about 2 s ("now" or "1 s ago" while Engaged), and the mode should go
   Engaged to Roaming at around 345 m and back to Engaged under 300 m.

Note: the server must be reachable from both phones, so outside you'll want a dev tunnel or a
hosted server rather than your Mac's Wi-Fi address.

If the phone is not on the same Wi-Fi as the Mac, use a tunnel, for example
`devtunnel host -p 5080 --allow-anonymous`, and enter the `https://...devtunnels.ms` URL it prints.

## Tests

```bash
cd ios/Packages/VirtuBattleCore
swift test
```

These run on macOS (and Linux) without a phone. In Xcode you can also open the package and use
Product > Test.
