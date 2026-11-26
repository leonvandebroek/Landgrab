# VirtuBattle server

ASP.NET Core (.NET 10) with a SignalR hub at `/hub/game`. State lives in memory; restarting the
server empties all rooms. This is the proof-of-concept server: it relays positions and decides each
phone's update rate mode (M1), and will grow to judge shots (M2) and relay Nearby Interaction
tokens (M3).

```bash
cd server/VirtuBattle.Server
dotnet run          # http://0.0.0.0:5080, health check at /health
```

```bash
cd server
dotnet test
```

## Hub contract (M1)

| Direction | Method | Arguments | Returns |
| --- | --- | --- | --- |
| client → server | `JoinRoom` | `roomCode` (4 to 8 letters or digits), `displayName` (1 to 24 chars) | `JoinRoomResponse` |
| client → server | `LeaveRoom` | none | none |
| client → server | `Ping` | `clientTimeMs` | `PongResponse` |
| client → server | `UpdatePosition` | `PositionUpdate` (sent without waiting for a result) | none |
| server → client | `RosterChanged` | `RosterChangedEvent` | |
| server → others in room | `PlayerMoved` | `PlayerPositionDto` | |
| server → one player | `RateModeChanged` | `RateModeChangedEvent` | |

## Rate modes

Each phone's mode follows the distance to its nearest other player with a position from the last
2 minutes. Leaving a mode needs a 15% margin past its threshold so GPS jitter doesn't make it flap.
Enums travel as camelCase strings.

| Mode | Nearest player | Send interval |
| --- | --- | --- |
| `idle` | nobody located | 10 s |
| `roaming` | over 300 m | 5 s |
| `engaged` | 40 to 300 m | 1 s |
| `closeCombat` | under 40 m | 0.5 s (in practice about 1 s, the GPS fix rate) |

Contracts live in `Hubs/GameContracts.cs`, mirrored in
`ios/Packages/VirtuBattleCore/Sources/GameClient/GameMessages.swift`.
