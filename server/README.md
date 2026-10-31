# VirtuBattle server

ASP.NET Core (.NET 10) with a SignalR hub at `/hub/game`. State lives in memory; restarting the
server empties all rooms. This is the proof-of-concept server: it will grow to decide update rate
modes (M1), judge shots (M2) and relay Nearby Interaction tokens (M3).

```bash
cd server/VirtuBattle.Server
dotnet run          # http://0.0.0.0:5080, health check at /health
```

```bash
cd server
dotnet test
```

## Hub contract (M0)

| Direction | Method | Arguments | Returns |
| --- | --- | --- | --- |
| client → server | `JoinRoom` | `roomCode` (4 to 8 letters or digits), `displayName` (1 to 24 chars) | `JoinRoomResponse` |
| client → server | `LeaveRoom` | none | none |
| client → server | `Ping` | `clientTimeMs` | `PongResponse` |
| server → client | `RosterChanged` | `RosterChangedEvent` | |

Contracts live in `Hubs/GameContracts.cs`, mirrored in
`ios/Packages/VirtuBattleCore/Sources/GameClient/GameMessages.swift`.
