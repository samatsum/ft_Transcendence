# REST_API_DESIGN — REST API / Database Detailed Design (③)

> Source: translated from the Japanese original at md_files/02_設計書/3-REST_API設計.md (archived).

**Position**: A detailing of [ARCHITECTURE_DESIGN.md](./0-全体アーキテクチャ設計.md) §2.4 / §3.3.
Includes the definitions of the three items that [WS_PROTOCOL_DESIGN.md](./2-WSプロトコル設計.md) (②)
delegated to REST (presence initial list / `GET /api/maps` / match detail).
Of the Backend/DevOps lanes, this corresponds to the work order for **torinoue** (Auth / REST / DB),
and also serves as the source of truth for the API contract for **mamiyaza** (frontend foundation).
**Principle**: This document contains no implementation code.
The implementation source of truth for message schemas is the zod definitions in `shared/api/`; if this document
and the implementation diverge, this document is revised first and the implementation follows (same operating rule as ②).

---

## 0. Premises and decisions finalized this round

| # | Topic | Decision | Rationale |
|---|---|---|---|
| D-4 | Session scheme | **Opaque session token (DB `Session` row) + httpOnly Cookie**. JWT not adopted | ② §7's reconnect identity verification and immediate logout invalidation require a DB lookup, so there is no benefit to being stateless. Only the token hash is stored in the DB. On logout, close 4000 any open lobby/game WS looked up from W-08's session connection index |
| D-5 | Cookie attributes | `HttpOnly; Secure; SameSite=Lax; Path=/`. **TTL 7 days, sliding extension on access** | Effectively eliminates re-login requests during the evaluation period. `Secure` assumes nginx TLS termination (A1) |
| D-6 | CSRF countermeasure | **SameSite=Lax + Origin header validation on mutating methods (POST/PATCH/PUT/DELETE)** | Unified with the WS Origin check approach in ② §1. No CSRF token is introduced (avoid building a duplicate mechanism) |
| D-7 | RefreshToken | **Not created** (the "Session / RefreshToken" in ARCHITECTURE §3.3 is consolidated into `Session`. This document revises §3.3) | The sliding extension in D-5 is sufficient. Same judgment as ② §7's "don't build a dual token system" |
| D-8 | Email verification / password reset | **Not implemented** | Not a subject requirement. Documented explicitly in the README's list of limitations |
| D-9 | JSON naming | **The wire format is snake_case** (unified with the WS payloads in ②). DB/TS internals are camelCase | The conversion is absorbed at the layer of the zod schema shared between FE/BE |
| D-10 | ID | All tables use integer autoincrement. The `:id` in URL paths is also an integer | Simplest with SQLite. Guessability is mitigated by access control (only public information is returned) |

The API prefix is `/api`. No versioning is done.
No public API module (API key / rate-limit documentation) has been selected, so this API is an internal API exclusively for this project's own SPA.

---

## 1. Common conventions

### 1-A. Error envelope

Failure responses share the following shape across all endpoints. `code` uses the same machine-readable snake_case
namespace as ② §2-C.

```
{ "error": { "code": "validation_failed", "msg": "human readable", "details": { "field": "reason" } } }
```

| HTTP | Example `code` | Usage |
|---|---|---|
| 400 | `validation_failed` | zod validation error (`details` gives per-field reasons) |
| 401 | `unauthenticated` | Invalid session / not logged in |
| 403 | `forbidden` | Mutating access to another user's resource |
| 404 | `not_found` | Resource does not exist |
| 409 | `conflict` / `email_taken` / `name_taken` / `already_friends` | Unique constraint / state conflict |
| 413 | `payload_too_large` | Avatar size exceeded |
| 415 | `unsupported_media_type` | Invalid avatar format |
| 429 | `rate_limited` | See §1-C |

### 1-B. Validation

All bodies and queries are validated on both FE and BE using the zod schemas in `shared/api/` (this is the REST-side
evidence for the mandatory requirement "validation on both frontend and backend"; the WS side is covered in ② §8).
The server additionally performs semantic validation (uniqueness, authorization, state).

| Field | Rule |
|---|---|
| `email` | RFC format, max 254 characters, lower-cased and unique |
| `password` | 8–128 characters. No complexity requirement is imposed (length is prioritized; argon2id is assumed) |
| `display_name` | 3–20 characters, `[a-zA-Z0-9_-]` only, unique case-insensitively |
| Pagination | `?page=1&per=20` (`per` capped at 50). Response is `{ items, page, per, total }` |

The character-set restriction on `display_name` also serves to reduce XSS attack surface (a target of the attack
battery in ARCHITECTURE §9.1).

### 1-C. Rate limiting (per IP + per session)

| Target | Limit | On exceeding |
|---|---|---|
| `POST /api/auth/login` / `signup` | 5 requests/min/IP | 429 (brute-force countermeasure) |
| `PUT /api/users/me/avatar` | 3 requests/min | 429 |
| Other mutating endpoints | 30 requests/min | 429 |
| GET endpoints | 120 requests/min | 429 |

---

## 2. Endpoint list

### 2-A. Auth (`/api/auth`) — Day 2–3

| Method / Path | Auth | Request | Response |
|---|---|---|---|
| `POST /api/auth/signup` | Not required | `email`, `password`, `display_name` | 201 + self + `Set-Cookie` (logged in at the same time as registration) |
| `POST /api/auth/login` | Not required | `email`, `password` | 200 + self + `Set-Cookie` |
| `POST /api/auth/logout` | Required | — | 204. Deletes the `Session` row + discards the cookie + calls `closeSessionConnections(sessionId)` to close both open WS connections with code 4000 |
| `GET /api/auth/me` | Required | — | 200 self (session check at SPA startup) |

- self = `{ id, email, display_name, avatar_url, created_at }`.
  **`email` is returned only for self** (never included in another user's profile).
- Login failure does not distinguish between a nonexistent email and a wrong password; the same message is returned
  for both (enumeration-attack countermeasure).
- Passwords use argon2id (memory 19MiB / iterations 2 / parallelism 1 — the OWASP-recommended line).
  This is a place where the evaluation may ask for an explanation of "hash + salt" (§9.1).

### 2-B. Users (`/api/users`) — Day 10

| Method / Path | Auth | Content |
|---|---|---|
| `GET /api/users/:id` | Required | Public profile: `{ id, display_name, avatar_url, created_at, last_seen_at, stats_summary }`. `stats_summary` is a summary of the aggregation in §2-D (played/win_rate by mode) |
| `PATCH /api/users/me` | Required | `display_name?`, `new_password?` (when `new_password` is given, `current_password` is required) |
| `PUT /api/users/me/avatar` | Required | multipart, 1 file. **≤ 2MB, png/jpeg/webp, magic-byte validation** (the Content-Type header is not trusted). The stored filename is server-generated as `<userId>.<ext>` (overwrite). Storage location is the `/data/avatars` volume; served statically via nginx at `/avatars/<file>` |

- Not deriving the avatar's filename/extension from user input eliminates path traversal and XSS-via-filename
  (a target of §9.1).
- Image re-encoding/resizing is not performed (out of scope for this project; defended only via the size cap, and
  documented as a limitation in the README).

### 2-C. Friends (`/api/friends`) — Day 10

The concrete realization of "adding friends and checking online status" from the Standard user management module
(core #6).
**The initial presence list is returned here; subsequent diffs come via the lobby WS `presence_update`** (division of
labor with ② §3).

| Method / Path | Content |
|---|---|
| `GET /api/friends` | `{ friends: [{ user, status }], sent: [request], received: [request] }`. `status` is obtained from W-08's `UserContextRegistry.getPresence(userId)` as `online\|in_queue\|in_game\|offline` |
| `POST /api/friends/requests` | Send a request specifying `display_name`. Self-request or an existing relationship (checked bidirectionally) returns 409 |
| `POST /api/friends/requests/:id/accept` | Recipient only. Sets `status` to accepted |
| `DELETE /api/friends/requests/:id` | Sender = cancel / recipient = reject (row deleted) |
| `DELETE /api/friends/:userId` | Unfriend (row deleted) |

- Real-time notification of requests is not performed (reflected only when the lobby screen re-fetches). Only
  presence is updated live via WS — this is a **deliberate simplification**.
- W-07 plugs a Prisma adapter into the `FriendResolver.getAcceptedFriendIds(userId)` interface owned by W-08. W-08
  checks the state version and sends diffs only to friend connections, so the REST layer does not hold a WebSocket
  directly, and the dependency direction does not create a cycle with the W-08→W-07 implementation order.

### 2-D. Matches & Stats (`/api/matches`, `/api/users/:id/stats`) — Day 8–9

The concrete realization of the Game statistics and match history module (core #8).
The path by which ② §6-C's `match_end.match_id` leads the results screen to call `GET /api/matches/:id`.

| Method / Path | Content |
|---|---|
| `GET /api/matches?user_id=&mode=&page=` | History (paginated, descending by `ended_at`). When `user_id` is omitted, returns the global feed |
| `GET /api/matches/:id` | `{ id, mode, map_id, rules, started_at, ended_at, end_reason, winner_team, winner_user_id, players: [{ user_id, display_name, is_ai, team, slot, points_scored, result }] }`. AI seats have `user_id: null, display_name: "AI"` |
| `GET /api/users/:id/stats` | `{ per_mode: { rsp: { played, wins, losses, draws, abandons, win_rate }, fps: {...} }, total: {...} }` |

**Statistics derivation rules** (no additional tables; derived via aggregation queries over `Match`/`MatchPlayer`, per
ARCHITECTURE §3.3):

- `win_rate = wins / (wins + losses + abandons)`.
  **Abandons are included in the denominator** (a mid-game departure is not treated as if it never happened; paired
  with the attribution rule in ② §6-C). Draws are excluded from the denominator.
- Rows where `isAi = true` are excluded from individual statistics (used only for displaying match detail).

### 2-E. Maps (`/api/maps`) — Day 8

The source of truth for the ID space referenced by ② §4-B's `rules.map`.

| Method / Path | Content |
|---|---|
| `GET /api/maps?mode=` | `[{ id, name, mode, description }]` |

- Maps are a **static whitelist built into the server** (an in-code lookup table `{id, name, mode, path}`). There is
  no user upload. G-09 map creation is published by appending to this table.
- `id` is the `.cub` file stem (existing examples: `rsp` / `rsp_pillars` / `21x21_arena` / `fps_duel`; the whitelist
  table below is the source of truth).
  At GameRoom creation time the server resolves the path via this table and distributes it as `welcome.map_text`
  (② §5-B. **The client never fetches a map via REST**).

**Whitelist (registered by G-09. Startup-verified on 2026-07-19; a `make test` G-09 check target)**

| id | name | mode | path |
|---|---|---|---|
| `rsp` | Open Field | rsp | `maps/rsp_map/rsp.cub` |
| `rsp_pillars` | Pillars | rsp | `maps/rsp_map/rsp_pillars.cub` |
| `21x21_arena` | Arena 21 | fps | `maps/fps_map/21x21_arena.cub` |
| `fps_duel` | Duel Run | fps | `maps/fps_map/fps_duel.cub` |

- Verification conditions (permanently covered by the G-09 checks in `codes/tests/sim_test.c`):
  RSP — red (N/W) 2 seats + blue (S/E) 2 seats spawn on distinct cells and a short match completes to a decision;
  FPS — a 1v1 with 2 seats + enemy hazards completes the gate path of "collect all → door D opens → reach the goal
  determines the winner."
  **Approval via in-team test play is a separate step** (the table above is to be transcribed once server
  implementation begins, from W-01 onward).

---

## 3. Prisma schema detail (source of truth for the ER diagram)

Finalizes the conceptual design of ARCHITECTURE §3.3 to an implementable level of detail. The README's Database
Schema chapter and ER diagram are generated from this table.

### `User`

| Column | Type | Constraint |
|---|---|---|
| id | Int | PK, autoincrement |
| email | String | unique (stored lower-cased) |
| passwordHash | String | argon2id string |
| displayName | String | unique (matched via a lower-cased unique index) |
| avatarPath | String? | relative name under `/data/avatars` |
| createdAt | DateTime | default(now) |
| lastSeenAt | DateTime? | updated on authenticated requests / WS disconnect |

### `Session`

| Column | Type | Constraint |
|---|---|---|
| id | Int | PK |
| userId | Int | FK → User, index |
| tokenHash | String | unique (**the raw token is never stored**; SHA-256) |
| createdAt / expiresAt | DateTime | `expiresAt` is updated on sliding extension |

### `Friendship`

| Column | Type | Constraint |
|---|---|---|
| id | Int | PK |
| requesterId / addresseeId | Int | FK → User. `@@unique([requesterId, addresseeId])`. **The reverse-direction existing relationship is checked at the application layer** (Prisma has no CHECK constraint) |
| status | String | `pending` / `accepted` |
| createdAt | DateTime | |

### `Match`

| Column | Type | Constraint |
|---|---|---|
| id | Int | PK |
| mode | String | `rsp` / `fps` |
| mapId | String | ID from §2-E |
| settingsJson | String | The `rules` from ② §4-B, stored as-is as JSON |
| startedAt / endedAt | DateTime / DateTime? | |
| winnerTeam | Int? | RSP: 0/1. Null for FPS and forced terminations |
| winnerUserId | Int? | FPS: the winner. Null for RSP |
| endReason | String? | `score` / `goal` / `forfeit` / `abandon` (same namespace as ② §5-D) |

### `MatchPlayer`

| Column | Type | Constraint |
|---|---|---|
| id | Int | PK |
| matchId | Int | FK → Match, index |
| userId | Int? | FK → User, index. **null = AI seat** (kept as a row for statistics consistency) |
| isAi | Boolean | |
| team / slot | Int | `@@unique([matchId, slot])` |
| pointsScored | Int | |
| result | String | `win` / `lose` / `draw` / `abandon` (attribution rule is in ② §6-C) |

(An `OAuthAccount { provider, providerUserId, userId }` table would be added only if the "hold 2" OAuth option is
adopted. Not built as part of the core.)

---

## 4. Security / evaluation coverage (REST-side coverage for §9.1)

| Evaluation sheet check | Coverage in this design |
|---|---|
| Password hash + salt | argon2id (salt embedded). The parameters from §2-A should be explainable verbally |
| SQLi practical test | Prisma (prepared-statement equivalent). Raw SQL is not used even for statistics aggregation (written using Prisma's groupBy/aggregate) |
| XSS practical test | React escaping + `display_name` character-set restriction + server-generated avatar filenames |
| Invalid input | Dual zod validation (§1-B) + boundary testing of 429/413/415 |
| Zero secrets exposure | Raw session tokens and passwords are never logged (pino redact configuration). `.env` follows W-15's `env.example` workflow |

---

## 5. Consistency checklist against ② and ①

| Requirement from the referenced document | Coverage in this document |
|---|---|
| ② §3-B "presence initial list is via REST" | `status` composition in `GET /api/friends` (§2-C) |
| ② §4-B "`GET /api/maps` (defined in ③)" | §2-E |
| ② §6-C "results screen detail is via REST" | `GET /api/matches/:id` (§2-D) |
| ② §6-C's result attribution rule | Value space of `MatchPlayer.result` and abandon inclusion in the denominator (§2-D) |
| ② §1 "do not put the token in the URL" | Cookie only. The token is stored as a hash (§3 Session) |
| ② §5-E room list API (hold 1) | **Left undefined**. `GET /api/rooms` will be appended to this document when hold 1 is started |
| ARCHITECTURE §3.3 | Detailed exactly per the conceptual design, except for the Session consolidation (D-7) |
