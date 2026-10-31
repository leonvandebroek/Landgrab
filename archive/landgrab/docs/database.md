# Database Schema

Landgrab uses **PostgreSQL 16** managed by **Entity Framework Core 8 (Npgsql)**. Migrations run automatically on startup.

Only Free-for-All (Global Map) data is persisted. Room-based Alliance game state is entirely in-memory.

---

## Entity-Relationship Overview

```
Users ──────────────────────────────────────────────────────┐
  │                                                         │
  │  (1:N via AllianceMembers)        owns GlobalHexes      │
  │                                                         │
  ├──◄ AllianceMembers ►──── Alliances                      │
  │                             │                           │
  │                             └── owns GlobalHexes        │
  │                                                         │
  ├── PasswordResetTokens                                   │
  └── GlobalHexes (as owner) ◄──────────────────────────────┘
```

---

## Tables

### `Users`

Stores registered user accounts.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `Id` | `uuid` | PK | Auto-generated |
| `Username` | `text` | NOT NULL, UNIQUE | Case-sensitive |
| `Email` | `text` | NOT NULL, UNIQUE | Lowercased on register |
| `PasswordHash` | `text` | NOT NULL | BCrypt, work factor 12 |
| `CreatedAt` | `timestamptz` | NOT NULL | UTC, set on insert |

---

### `Alliances`

Persistent alliances for the Free-for-All mode.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `Id` | `uuid` | PK | Auto-generated |
| `Name` | `text` | NOT NULL | Alliance display name |
| `Tag` | `text` | NOT NULL | Short tag (e.g. `"RED"`) |
| `OwnerId` | `uuid` | FK → Users.Id | Alliance founder |
| `CreatedAt` | `timestamptz` | NOT NULL | UTC |

---

### `AllianceMembers`

Join table — a user may belong to multiple alliances.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `UserId` | `uuid` | PK (composite), FK → Users.Id | |
| `AllianceId` | `uuid` | PK (composite), FK → Alliances.Id | |
| `JoinedAt` | `timestamptz` | NOT NULL | Used for ordering when resolving "current" alliance |

> **Note:** No single-alliance constraint is enforced. A user's "active" alliance (used for `OwnerAllianceId` on global hexes) is resolved by selecting the most recently joined one (`JoinedAt` descending).

---

### `GlobalHexes`

Persistent hex ownership for the Free-for-All map. One record per owned hex.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `Q` | `integer` | PK (composite) | Axial Q coordinate |
| `R` | `integer` | PK (composite) | Axial R coordinate |
| `OwnerUserId` | `uuid` | NULLABLE, FK → Users.Id | Null = unclaimed |
| `OwnerAllianceId` | `uuid` | NULLABLE, FK → Alliances.Id | Alliance of owner at time of capture |
| `Troops` | `integer` | NOT NULL | Current troop count on this hex |
| `LastCaptured` | `timestamptz` | NULLABLE | When the hex last changed hands |
| `AttackCooldownUntil` | `timestamptz` | NULLABLE | After a failed attack, set to now + 5 minutes |

Coordinate scale: 1 hex unit ≈ 1 km. See [architecture.md](architecture.md#hex-grid-system) for the LatLng↔Hex conversion.

---

### `GameEvents`

Audit log of game events (used for replay / analytics). Append-only.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `Id` | `uuid` | PK | Auto-generated |
| `EventType` | `text` | NOT NULL | e.g. `"HexCaptured"`, `"PlayerJoined"` |
| `UserId` | `uuid` | NULLABLE, FK → Users.Id | Actor |
| `Payload` | `jsonb` | NULLABLE | Event-specific JSON data |
| `OccurredAt` | `timestamptz` | NOT NULL | UTC |

---

### `PasswordResetTokens`

Short-lived tokens for the password-reset flow.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| `Id` | `uuid` | PK | Auto-generated |
| `UserId` | `uuid` | NOT NULL, FK → Users.Id | Owner of the reset request |
| `TokenHash` | `text` | NOT NULL | HMAC-SHA256(rawToken, Jwt:Secret) — raw token is emailed, never stored |
| `ExpiresAt` | `timestamptz` | NOT NULL | 1 hour from creation |
| `UsedAt` | `timestamptz` | NULLABLE | Set on successful reset; prevents reuse |

---

## Conventions

- All primary keys are `uuid` (Guid in C#)
- All timestamps are `timestamptz` stored in UTC
- Navigation properties use EF Core lazy-loading conventions; `GlobalHex` queries include `Owner` and `OwnerAlliance` via `.Include()` for the API responses
- The composite PK on `GlobalHexes (Q, R)` means each real-world square kilometre can have exactly one ownership record
- Migrations live in `backend/Landgrab.Api/` and are applied automatically at startup; they can also be applied manually with `dotnet ef database update`
