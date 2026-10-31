# VirtuBattle iOS (proof of concept)

SwiftUI app for iOS 18+. Milestone M0: connect to the game server, join a room with a code, see who
else is in it and the round-trip time.

```
ios/
├── project.yml                 XcodeGen spec (the .xcodeproj is generated, not committed)
├── Config/                     Signing.xcconfig + your git-ignored Local.xcconfig
├── VirtuBattle/                App target: SwiftUI views and AppModel
└── Packages/VirtuBattleCore/   UI-free logic with unit tests
    ├── GameClient              Minimal SignalR client (JSON over WebSockets) + hub messages
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

A second phone, or the iOS Simulator on the Mac, can join the same room code to see the roster
update live. The Simulator is fine for M0; GPS walking, compass and UWB need real phones later.

If the phone is not on the same Wi-Fi as the Mac, use a tunnel, for example
`devtunnel host -p 5080 --allow-anonymous`, and enter the `https://...devtunnels.ms` URL it prints.

## Tests

```bash
cd ios/Packages/VirtuBattleCore
swift test
```

These run on macOS (and Linux) without a phone. In Xcode you can also open the package and use
Product > Test.
