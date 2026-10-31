# HTTP API Reference

All HTTP endpoints are under the base path `/api`. The Vite dev proxy forwards `/api` to `http://localhost:5001`, so the frontend never hardcodes the backend URL.

Auth-protected endpoints require a `Bearer` token in the `Authorization` header.

---

## Authentication  `/api/auth`

All auth endpoints are rate-limited: **10 requests / minute / IP** (the `"auth"` policy).

### `POST /api/auth/register`

Create a new user account.

**Request body**
```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "supersecret123"
}
```

**Validations**
- Password minimum 8 characters
- Username and email uniqueness enforced at the DB level

**Response `200 OK`**
```json
{
  "token": "<jwt>",
  "username": "alice",
  "userId": "3fa85f64-..."
}
```

**Response `400 Bad Request`** — validation failure or duplicate account
```json
{ "error": "Username already exists" }
```

A welcome email is sent asynchronously (or logged to console in dev).

---

### `POST /api/auth/login`

Authenticate an existing user.

**Request body**
```json
{
  "usernameOrEmail": "alice",
  "password": "supersecret123"
}
```

**Response `200 OK`** — same shape as register
**Response `401 Unauthorized`** — invalid credentials

---

### `POST /api/auth/forgot-password`

Trigger a password-reset email. Always returns `200` regardless of whether the address exists (prevents user enumeration).

**Request body**
```json
{ "email": "alice@example.com" }
```

**Response `200 OK`**
```json
{ "message": "If that email exists, a reset link has been sent." }
```

The reset URL is `{App:BaseUrl}/reset-password?token=<rawToken>`. The token is HMAC-SHA256 hashed before storage.

---

### `POST /api/auth/reset-password`

Complete a password reset.

**Request body**
```json
{
  "token": "<rawToken from email>",
  "newPassword": "newpassword456"
}
```

**Response `200 OK`** — success
**Response `400 Bad Request`** — token expired, already used, or not found

---

## Alliances  `/api/alliances`

These endpoints manage **persistent alliances** used by the Global FFA mode. They are distinct from the transient in-game alliances that exist only inside a room's game state.

All endpoints require authentication.

---

### `POST /api/alliances`

Create a new persistent alliance.

**Request body**
```json
{
  "name": "The Red Empire",
  "tag": "RED"
}
```

**Response `200 OK`**
```json
{
  "id": "3fa85f64-...",
  "name": "The Red Empire",
  "tag": "RED",
  "ownerId": "...",
  "memberCount": 1
}
```

---

### `GET /api/alliances`

List all alliances with member count.

**Response `200 OK`**
```json
[
  { "id": "...", "name": "The Red Empire", "tag": "RED", "memberCount": 4 },
  ...
]
```

---

### `POST /api/alliances/{allianceId}/join`

Join an existing alliance. A user may belong to multiple alliances.

**Response `200 OK`** — success
**Response `404 Not Found`** — alliance not found

---

### `DELETE /api/alliances/{allianceId}/leave`

Leave an alliance.

**Response `200 OK`** — success

---

## Global Map  `/api/global`

Endpoints for the Free-for-All persistent map. All endpoints require authentication.

---

### `GET /api/global/hexes`

Get hexes near a geographic location.

**Query parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `lat` | `double` | Latitude |
| `lng` | `double` | Longitude |
| `radius` | `int` (optional, default `20`) | Hex radius to fetch around centre |

**Response `200 OK`**
```json
[
  {
    "q": 3,
    "r": -2,
    "ownerUserId": "...",
    "ownerAllianceId": null,
    "troops": 5,
    "lastCaptured": "2024-01-15T10:30:00Z",
    "attackCooldownUntil": null,
    "owner": { "username": "alice" },
    "ownerAlliance": null
  },
  ...
]
```

---

### `POST /api/global/attack`

Attack a hex from an adjacent hex that you own.

**Request body**
```json
{
  "fromQ": 3, "fromR": -2,
  "toQ": 4,   "toR": -2
}
```

**Validations**
- `from` hex must be owned by the authenticated user
- `to` hex must be adjacent to `from`
- A 5-minute cooldown applies after a failed attack

**Response `200 OK`**
```json
{
  "won": true,
  "attackerTroops": 4,
  "defenderTroops": 0
}
```

**Response `400 Bad Request`** — validation failure (not adjacent, not owned, on cooldown, etc.)

---

### `GET /api/global/leaderboard`

Top 20 players ranked by hex count.

**Response `200 OK`**
```json
[
  { "userId": "...", "username": "alice", "hexCount": 42, "allianceName": "The Red Empire" },
  ...
]
```

---

### `GET /api/global/my-territories`

All hexes owned by the authenticated user.

**Response `200 OK`** — array of `GlobalHex` objects (same shape as `/hexes`)

---

## Health Check

### `GET /healthz`

Simple liveness probe.

**Response `200 OK`** — `"Healthy"`

---

## Error Format

All error responses use a consistent JSON envelope:

```json
{ "error": "<human-readable message>" }
```

HTTP status codes used:

| Code | Meaning |
|------|---------|
| `200` | Success |
| `400` | Validation failure / bad request |
| `401` | Missing or invalid JWT |
| `403` | Forbidden (wrong user / room) |
| `404` | Resource not found |
| `429` | Rate limit exceeded |
| `500` | Unexpected server error |
