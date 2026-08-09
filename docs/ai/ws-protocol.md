# WS Protocol Design — WebSocket Protocol / GameRoom & Matchmaking Detailed Design (2)

> Source: translated from the Japanese originals at md_files/02_設計書/2-WSプロトコル設計.md and md_files/03_実装レポート/3-エンジンPhase3レポート.md (both archived).

**Position**: A detailing of [ARCHITECTURE_DESIGN.md](./architecture.md) §2.3 / §3.1. Aligned with [ENGINE_SEPARATION_DESIGN.md](./engine-separation.md) §3-B (sim public API) and §3-D (snapshot structure). This is the authoritative work order for the Backend/DevOps lane's WS / GameRoom / matchmaking work (B-09, implemented by samatsum). The GameView work (GV-06) and HUD work (GV-07, merged via [PR #35](https://github.com/samatsum/ft_Transcendence/pull/35)) consume this document as the client implementation contract; both are **done**, also implemented by samatsum.
**Principle**: This document contains no implementation code (wire format, state machines, and acceptance criteria only). The implementation source of truth for message schemas is the zod definitions in `shared/`; if implementation diverges from this document, revise this document first, then implement.

> **Reading this after the 2026-08-08 module revision (D-19).** Two things changed for this document,
> and neither invalidates the wire format:
>
> - **`match_result` (§5) and the `persistMatch` closure (§7-B) are designed but no longer declared.**
>   They exist because of B-13 (match persistence), which was dropped — see
>   [architecture.md §4.3](./architecture.md). The design stays here verbatim because B-13 is
>   **restore candidate №1**: on its own it brings back "add another game" (2pt). Treat those sections
>   as a specification on the shelf, not as a work order. The same applies to B-07's `FriendResolver`
>   Prisma adapter in §6 — B-08 already ships a working fake resolver, which is all the declared
>   lineup needs.
> - **`spectate` went the other way and is now required.** The spectator module is part of the adopted
>   +5pt bonus, so the `spectate` message family and `welcome.role === "spectator"` must actually work
>   at evaluation. The handler in `app/backend/src/game/ws.ts` currently answers `not_participant`;
>   closing that gap is **B-17**.

---

## 0. Premises and decisions finalized in this round

Decisions already finalized (not to be reconsidered): server authority + JSON snapshots (sim at 30Hz / distribution at 15-20Hz / 100ms interpolation / prediction limited to viewpoint rotation only), 5 WS message families `join / input / snapshot / event / spectate`, disconnected seats are replaced by AI then returned to the human on reconnect, the matchmaking queue is shared infrastructure across both games, `@fastify/websocket` + nginx WSS termination.

Newly finalized decisions made while writing this document (team agreement 2026-07-08):

| # | Topic | Decision |
|---|---|---|
| D-1 | Matchmaking method | Two tracks: **Quick Match (FIFO, default rules) + Custom Room (room-code invitation, host configures the #11 customization options)** |
| D-2 | Starting when under capacity | **Manual + timeout combined**: a "Fill with AI and start now" button for the queue leader, plus automatic AI fill-in after 60 seconds |
| D-3 | Reconnect grace period | **30 seconds** (RSP: AI substitute → returns to human on reconnect / FPS: forfeit after 30 seconds elapse. Same value for both) |

### 0-A. Design principles inherited by B-08 from the I-01-onward implementation (finalized 2026-07-30)

B-08 introduces no new approach; it extends horizontally to the lobby the boundaries that samatsum implemented and verified in I-01 / B-10 / B-11 / B-14. Concretely, the following five points are fixed:

| Existing implementation | Principle B-08 inherits |
|---|---|
| I-01 `app/{backend,frontend,shared}` | The wire contract is single-sourced from the zod definitions in `app/shared/src/ws/lobby.ts`; BE/FE do not define their own types. The browser connects to both REST and WS on the same origin |
| B-10 `room.ts` / `rooms.ts` | The state machine lives in a pure layer that knows nothing about WS. Time, randomness, and external processing are injectable so it can be tested deterministically. Duplicate async creation is prevented via `reserved` / state reservation |
| B-11 `game/ws.ts` | Only the gateway layer knows about WebSocket. Messages received before authentication completes are held with a bound; shape is validated by zod, meaning/authorization/current-state are validated in code. Replacing the same user's connection neutralizes the old connection's close |
| B-14 `maps.ts` / `createRoomFromRules` | The client's map ID is resolved via a static whitelist and never accepts a path. The lobby passes finalized rules to B-09, and GameRoom only ever sees `.cub` text |
| B-10/B-11 acceptance checks | Real-time end-to-end checks are separated from deterministic checks using a fake clock. "Passing by checking zero occurrences" is prohibited; under contention, checks confirm processing happens **exactly once** by count |

Following this inheritance, lobby implementation lives at `app/backend/src/lobby/`, game execution stays in the existing `app/backend/src/game/`, and shared contracts live in `app/shared/src/ws/`. LobbyRoom and GameRoom are not unified into a single `Room` type: the former is a waiting room managing invitations, seats, and rules; the latter is one `sim.wasm` execution unit per match, and the two have different lifecycles.

---

## 1. Connection topology (WS endpoint design)

| Option | Summary | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Two separate endpoints (adopted)** | `/ws/lobby` (persistent connection after login) and `/ws/game/:roomId` (only during a match) | Connection lifecycle matches usage (the game WS disappears along with the room). Routing, authorization, and rate limiting are simplified per use case. The always-on lobby connection is itself the basis for presence (online status) | Up to 2 WS connections from the browser | Adopted |
| Single multiplexed WS | One WS multiplexed via a channel field | One connection | Room-membership state management leaks into the app layer, complicating cleanup on disconnect. Game WS congestion drags in lobby notifications | Rejected |

- **Authentication**: verify the httpOnly session cookie at WS upgrade time (same-origin, so the browser sends it automatically; nginx proxies the Cookie header as-is). **Putting the token in the URL query string is forbidden** (to avoid leaking it into access logs). Unauthenticated connections close with `4000`.
- **Origin check**: at upgrade time, reject connections whose `Origin` header does not match the host (CSRF-over-WS defense). **The close code is `4003` (not authorized to join)** (added 2026-07-27; this was the only rejection without an assigned code. `4000` means "unauthenticated / session expired," i.e. a Cookie problem, and is distinguished from an Origin mismatch).
- **Heartbeat**: the server sends a WS ping every 10 seconds (the browser auto-pongs). **Two consecutive non-responses (20 seconds) counts as disconnected**, and on the game WS this starts the disconnect flow in §7. No application-layer keepalive message is defined (the protocol-level mechanism suffices).
- **Multiple connections from the same user**: when the same user opens a new connection to the same endpoint, **the old connection is closed with `4004` (replaced)** (so reloads / duplicate tabs naturally let the newest connection win).

---

## 2. Common message conventions

### 2-A. Envelope

Every message is exactly one JSON text frame = one message.

```json
{ "t": "<message type>", "d": { ...payload } }
```

- `t` is snake_case. `d` has a zod schema per type defined under `shared/ws/` and shared by FE/BE (this is where the input-validation requirement is satisfied).
- Protocol version: the server's first message to the client (`lobby_hello` / `welcome`) includes `v: 1`. The client should prompt a reload on mismatch (always 1 during the evaluation period; reserved for future compatibility).
- Client→server messages are capped at **4KB** (over the limit closes with `4001`). An unknown `t` or a schema violation gets an `error` response (§2-C) and **does not disconnect** (to keep forward compatibility during development) — except that 10 consecutive violations close with `4001`. **Definition of "consecutive" (added 2026-07-27)**: the counter **resets to 0 on any message that passes validation**. If it were a lifetime total for the connection, a long-lived, well-behaved client would eventually trip it by accident.

### 2-B. WS close code conventions

| code | meaning | raised by |
|---|---|---|
| 1000 | Normal close (screen transition, leaving after match end) | either side |
| 4000 | Unauthenticated / session expired | at upgrade |
| 4001 | Protocol violation (accumulated schema violations, size exceeded) | server |
| 4002 | Room does not exist / already closed | game WS join |
| 4003 | Not authorized to join (full / not a participant) | game WS |
| 4004 | Replaced by a new connection | server |
| 4005 | Rate limit exceeded | server |

### 2-C. Error messages (inline)

`{ t: "error", d: { code: string, msg: string, ref?: string } }`. `code` is machine-readable (e.g. `queue_already_joined` / `room_full` / `invalid_rules`), `ref` is the `t` of the client message that caused it. The error list is enumerated in `shared/ws/errors.ts` and documented individually in each section of this document.

### 2-D. Rate limiting (server-side, per connection)

| Target | Limit | On exceeding |
|---|---|---|
| Game WS `input` | 40 msg/s (30Hz send + jitter margin) | Excess silently dropped (not disconnected) |
| All lobby WS types | 5 msg/s / connection | `error(rate_limited)`; close `4005` after 10 consecutive violations with no valid message in between |
| `room_create` | 3/min/user | `error(rate_limited)` |
| `room_join` | 20/min/user | `error(rate_limited)` (defense against brute-forcing room codes) |

---

## 3. Lobby WS spec (`/ws/lobby`)

Opened once, persistently, by the SPA after successful login. Used for (1) presence, (2) matchmaking, (3) custom rooms, (4) live reflection of match results (the primary evidence for module #5 "connect/disconnect handling and broadcasting").

### 3-A. Server→client

`app/shared/src/ws/lobby.ts` defines the following as a closed discriminated union. IDs are the same positive integer as the DB's `Int`; only `room_id` and the invitation `code` are strings.

| t | d (exact shape) | trigger |
|---|---|---|
| `lobby_hello` | `v:1`, `online_count:int`, `self:{status}` | Always sent exactly once, immediately after authentication and connection registration. `online_count` is the number of unique users with a lobby WS |
| `presence_update` | `user_id:int`, `status: online\|in_queue\|in_game\|offline` | On status change. Delivered **only to accepted friends' connections**, never broadcast globally |
| `queue_state` | `mode`, `position:int` (1-based), `waiting:int`, `auto_fill_in_ms:int`, `is_leader:bool` | On queue change + once per second while non-empty. Sent individually only to queue members |
| `match_found` | `room_id:string`, `mode`, `slot:int` | After successful GameRoom creation in B-09. Sent individually only to human participants |
| `room_state` | `code`, `mode`, `state:open\|starting`, `host_id:int`, `rules`, `seats[]` | Resent in full to all members every time the LobbyRoom changes |
| `match_result` | `match_id:int`, `mode`, `end_reason`, `winner_team:0\|1\|null`, `winner_user_id:int\|null`, `players[]` | After B-13 persists the match, broadcast the same string **to all lobby connections** |
| `error` | §2-C | Sent only to the sender whose operation could not be accepted |

`room_state.seats[]` is `{slot:int, user_id:int|null, display_name:string|null, is_ai:bool}`. An empty seat is `user_id=null, display_name=null, is_ai=false`; an AI seat is `user_id=null, display_name="AI", is_ai=true` — state is never left to be inferred from optional fields.

`match_result.players[]` is `{user_id:int|null, display_name:string, is_ai:bool, team:int, slot:int, result:win|lose|draw|abandon}`; `end_reason` is `score|goal|forfeit|abandon`. For RSP only `winner_team` is non-null. For FPS, a human winner sets `winner_user_id`; for an AI winner both winner columns are null, and the AI seat's entry in `players[]` is marked `win`. An abandoned match is distinguished by both winner columns being null **and** `end_reason=abandon`. This mutual constraint is enforced both by the zod shape and by server-side semantic validation.

### 3-B. Client→server

| t | d | validation / errors |
|---|---|---|
| `queue_join` | `mode: rsp\|fps` | Accepted only from `idle`. Other queue / LobbyRoom / in-match states get a state-specific error (**one-user-one-context principle**) |
| `queue_leave` | — | No-op if not a member |
| `queue_fill_start` | — | Accepted only from the queue leader (oldest entry); others get `not_leader` (the manual button from D-2) |
| `room_create` | `mode`, `rules?` (§4-B; omitted fields take defaults) | `idle` only. Shape via zod; map existence and mode match are validated server-side |
| `room_join` | `code` | `idle` only. Nonexistent → `room_not_found` / full → `room_full` / starting → `room_starting` |
| `room_leave` | — | No-op if not a member. Leaving is only allowed while `open`; host handoff per §4-B |
| `room_update_rules` | complete canonical `rules` | Host only. Full replacement, not a partial update. `room_starting` once starting |
| `room_start` | — | Host only. Empty seats are filled with AI before starting |

The initial presence list (friend list + status) is fetched via REST; only subsequent deltas arrive over this WS (defined in ③).

`room_join.code` is normalized via `trim → upper-case` in the shared schema before being validated against `^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$`. FE/BE use the same transform, so lowercase input or surrounding whitespace alone never causes a join failure.

### 3-C. Closed list of lobby-specific errors

The lobby-specific codes in `wsErrorCodeSchema` form the following closed list. Already-defined codes are kept as-is; missing ones are added.

| code | condition |
|---|---|
| `queue_already_joined` | Already in some queue |
| `already_in_room` | Requesting queue / create / join while already a LobbyRoom member |
| `already_in_game` | Requesting a lobby operation while in `starting_match` / `in_match` |
| `not_leader` | `queue_fill_start` from outside the queue or from a non-leader |
| `room_not_found` | Code does not exist, or has already moved to a GameRoom |
| `room_full` | Human seats at capacity |
| `not_host` | Non-host updating rules / starting |
| `room_starting` | join / update / start after `open → starting` has been reserved |
| `invalid_rules` | rules shape, range, map ID, or mode mismatch is invalid |

UI branches on `code`, not message text.

Internal GameRoom-creation failures send the existing `internal_error` to every affected user, followed by `queue_state` / `room_state` reflecting the §4-E rollback. Unknown messages, >4KB, and rate limiting use the common codes from §2. The dispatcher first resolves `t` from the envelope, then validates against the type-specific schema. Unknown `t` → `unknown_message`; malformed `rules` on `room_create` / `room_update_rules` → `invalid_rules`; malformed shape for any other known `t` → `validation_failed`. Only these schema violations count toward the §2-A consecutive-violation counter; business-state errors do not.

### 3-D. Connection setup, heartbeat, session expiry

The connection sequence proven in B-11 is applied to the lobby as well.

1. Validate `Origin` via `isAllowedOrigin`. Mismatch closes with `4003`.
2. Attach the message listener before authentication completes, holding up to 16 frames and 64KB total, in order. Exceeding that closes with `4001`. After authentication, the same frames flow into the same dispatcher.
3. If `authenticateRequest` returns null, close with `4000`.
4. Resolve the user profile (`display_name`) from the User repository. Only when using the development stub is `dev-<userId>` used; in production, a DB resolution failure never silently falls back to an anonymous name.
5. Register the new connection as the "current" connection first, then close the same user's old lobby connection with `4004`.
6. Send `lobby_hello`, then resend the current context per §3-F.

Connections carry a monotonically increasing `connection_id`. The close handler performs state cleanup only if "the currently registered `connection_id` matches its own." A delayed close on a replaced old connection must never wipe out the new connection's queue or LobbyRoom membership.

The server pings every 10 seconds and clears the alive flag on receiving a pong. If pong is missing for two consecutive cycles, it calls `terminate()`, which funnels into the normal close handler. The timer stops when the connection set is empty and is `unref()`'d so it never keeps the Node process alive. B-08 introduces a shared heartbeat helper, and the existing game WS is migrated to the same helper (applying the same convention to both endpoints in §1).

To make immediate logout invalidation apply even to open WS connections, connections are also indexed by `session_id`. B-04's logout calls the shared `closeSessionConnections(sessionId)` right after deleting the Session row, closing both lobby and game with `4000`. Every unique connected Session is re-validated once every 60 seconds: if valid, extend the D-5 sliding expiry; if invalid, perform the same close. The re-validation and logout hook are owned by B-04/B-05; the connection index and close API are owned by B-08's shared WS infrastructure. So B-08's feature implementation can proceed ahead using an auth stub, but its completion criteria include the B-05 Origin check and this session-expiry path.

In development, too, the browser uses `location.host` to connect same-origin to `/ws/lobby`. Vite proxies `/ws` to the backend with `ws: true`, in addition to `/api`. In production, nginx routes the same two paths. No port number is ever embedded in the client.

### 3-E. UserContextRegistry (the source of truth for one-user-one-context)

B-08 holds a single module-scoped Map from userId → context. queue / LobbyRoom / B-09 must not maintain their own "user membership map" as a source of truth.

| context | values held | allowed next operations | published presence |
|---|---|---|---|
| `idle` | — | queue join / room create / room join | `online` if a lobby connection exists, `offline` otherwise |
| `queued` | `mode`, `joined_at`, `sequence` | leave / leader fill-start | `in_queue` |
| `in_room` | `code`, `joined_at` | leave / host update / host start | `online` while connected; `offline` while in grace with no connection |
| `starting_match` | `token`, `source`, pre-freeze context | no lobby operations allowed | `in_queue` if quick-match-sourced, connection-state-derived if room-sourced |
| `in_match` | `room_id`, `mode`, `slot` | no lobby operations allowed | `in_game` (maintained through match end even while the lobby connection is down) |

State changes are made by **comparing the expected context value within a synchronous section, then writing once**. Any commit / rollback that happens after `await`-ing external I/O only proceeds if `token` matches, so a stale async completion never overwrites newer state.

Presence state is never duplicated in a separate Map; it's derived from context and the current lobby connection. B-08 owns the `FriendResolver.getAcceptedFriendIds(userId)` interface. A version counter increments on every state change, and if that version is stale by the time an async result returns, the send is discarded. This ensures that even if DB lookups for an `online → in_queue` transition complete out of order, a stale `online` is never delivered after the fact. B-08 alone tests "delivered only to friends" using a fake resolver; the later B-07 plugs a Prisma adapter into the same interface, preserving the B-08→B-07 dependency direction. `GET /api/friends` reads this Registry's `getPresence(userId)`.

`match_result` alone bypasses the friend restriction and is sent as a single pre-stringified string, once, to every current lobby connection. A send buffer over 1MB closes with `4005`. Unlike a snapshot, a lobby notification has no resend source, so intermediate messages are never trimmed to 64KB.

### 3-F. Context handling on close / reconnect

Handling by close reason and context is fixed as follows.

| context / reason at close | handling |
|---|---|
| `replaced` (4004) | **No action**. The new connection inherits the same context |
| `queued` | Leave immediately as specified. Recompute the queue and send `queue_state` to remaining members |
| `in_room` (ordinary disconnect / heartbeat timeout) | Hold the seat for 10 seconds. On reconnect, cancel the timer and resend `room_state`. On expiry, perform the same host handoff / dissolution as `room_leave` |
| `in_room` (explicit logout / session expiry) | Leave immediately with no grace period, so no ghost seat is left after logout |
| `starting_match` / `in_match` | Not cancelled on the lobby side. Handled by the 10-second GameRoom join wait / the B-12 game-WS 30-second grace |
| `idle` | Only a presence update to offline |

LobbyRoom's 10 seconds is **a different value from the 30-second in-match reconnect grace**. The front end's 1s→2s→5s backoff can recover within 3 tries, and 10 seconds also avoids creating an indefinite ghost seat.

After reconnect / replacement, the current context is resent right after `lobby_hello`.

- `queued`: the latest `queue_state`
- `in_room`: the latest `room_state`
- `starting_match`: resend the state of the original context; operations are rejected with `room_starting` / `already_in_game`
- `in_match`: resend the same `{room_id, mode, slot}` `match_found` so the client can return to `/game/:roomId`
- `idle`: nothing extra sent

---

## 4. Matchmaking detailed spec

### 4-A. Quick match (FIFO queue)

- There are **two queues, one per mode** (RSP / FPS). Data is an in-memory FIFO (order = join time). The queue may be lost on server restart (unlike in-match data, it is not persisted).
- Each entry holds `user_id / display_name / joined_at / sequence`. Even entries joining in the same millisecond get a full order via `sequence`, rather than relying on implicit array order.
- Match-forming counts: RSP=4 / FPS=2. **Forming is evaluated only on join, leave, manual start, and timeout events** (not polled).
- Slot assignment: slots `0,1,2,3` are assigned from the head of the queue. **RSP teams: slots 0,1 = team A / slots 2,3 = team B** (sequential, not by parity — intentionally so that friends joining consecutively tend to land on the same team). FPS: slots 0,1.
- **Under-capacity start from D-2**: the queue head's (leader's) screen always shows "Fill with AI and start now" (`queue_state.is_leader`). In addition, it fires automatically at **the oldest entry's `joined_at + 60 seconds`** (`auto_fill_in_ms` reaching 0). Either way, missing seats are filled with `is_ai: true` to form the match.
- When the leader leaves, the timer is rearmed against the next entry's own `joined_at + 60 seconds`. If that deadline has already passed, it fires immediately on the next event-loop turn, without granting the new leader a fresh 60 seconds.
- Per mode there is one match-forming `setTimeout`, and one display-update 1-second timer shared across all queues. Both accept a fake clock / injected `now()` so the 60-second wait can be tested without a real-time wait.
- Disconnection (lobby WS closing) leaves the queue immediately. Re-joining requires an explicit `queue_join`.
- When `queue_join` reaches capacity, the head entries are claimed into `starting_match` within the same synchronous section, before `queue_fill_start` or the timeout can fire. Unselected entries keep their order.
- All-lobby-types 5 msg/s is per connection, but `room_create` (3/min) and `room_join` (20/min) are counted per userId across reconnects, to prevent code brute-forcing and rate-limit evasion via reconnecting.

### 4-B. Custom room (D-1)

- `room_create` issues a room code: 6 characters from the exact alphabet **`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`** (32 characters) via `node:crypto.randomInt`. Valid only for the LobbyRoom's lifetime; not used as a substitute for authentication or authorization.
- **Code issuance is atomic**: generate → `Map.has` → `Map.set` complete within a single synchronous section with no `await`. On collision, regenerate; after 32 failures, `internal_error` plus structured logging. The RNG is injectable so tests can deliberately force collisions and confirm retry behavior.
- Host privileges: change `rules`, `room_start`, and (implicitly) dissolve. If the host leaves, **host handoff goes to the oldest remaining member**; if everyone leaves, the room dissolves immediately.
- LobbyRoom holds `state: open|starting`. A human takes the lowest open slot, and `joined_at / sequence` is tracked separately to determine host-handoff order.
- Rules (the substance of #11 customization; B-09 uses the finalized values, and B-13 stores them verbatim in `Match.settingsJson`):

| field | type / range | default | applies to |
|---|---|---|---|
| `map` | ID from the server's map list (`GET /api/maps`, defined in ③) | mode's default map | both |
| `target_score` | int 3-21 | 10 | RSP only (G-05's `match_rules.target_score`) |

- **Trimmed after implementation review (2026-07-30)**: the earlier table's `move_speed_mult / enemy_speed_mult / ai_level` have no application point anywhere in the current `t_match_rules`, `GameRoom.create`, or `createRoomFromRules`. Accepting and merely storing them would mean "changed in the UI but has no effect on the match," so they are removed from the B-08 wire. If added in future, extend in the order engine API → GameRoom → shared schema → this table.
- Canonical rules are RSP=`{map, target_score}`, FPS=`{map}`. Fields omitted on `room_create` are filled with server defaults; thereafter `room_state` / `room_update_rules` / MatchPlan require every field. The zod object is `strict`, so a removed field is never silently dropped.
- `map` is validated for shape as a zod string, then semantically validated against existence and mode match via B-14's `findMap`. A mismatch yields `invalid_rules`. Arbitrary paths or a client-supplied `.cub` are never accepted.
- Quick match always uses the default canonical rules (RSP=`rsp/10`, FPS=`fps_duel`), which eliminates any "rule agreement among queue participants" problem (the intent behind D-1).
- Seats: `seats[]` sized to the mode's capacity. Any seat a human doesn't fill is AI-ified at start. **At least one human (the host) is required to start** (an all-AI match cannot be created).
- Joins / leaves / rule updates while `open` each send the same updated `room_state` to all members once complete. No seat, host, or rules change is allowed while `starting`.

### 4-C. From forming to match start (both methods)

```text
[synchronous claim] Queue full / fill-start / timeout / room_start
   │  target users → starting_match, LobbyRoom → starting, rules/seats frozen
   ▼
[B-09 async] GameRoom creation (§6): game_create → game_add_combatant for human/AI seats
   │  success: token-verified commit / failure: rollback to original context
   ▼
[match_found delivery] over lobby WS, individually to each human participant: { room_id, mode, slot }
   │  the SPA navigates to /game/<room_id>, opens the game WS, and sends join
   ▼
[connection wait: up to 10s] all human seats' join complete, or 10s elapse
   │  unconnected seats are swapped for AI and play continues (not cancelled)
   │  the room is discarded only if zero humans ever connected (no match record)
   ▼
[countdown] event(countdown, 3s) → event(match_start) → match.state=playing
```

- The 10-second connection wait is separate from D-3's 30-second reconnect grace (short before start, long after start).
- **A seat AI-ified after the 10-second wait is thereafter excluded from the set of "human seats being waited on for early start."** The `created → countdown` transition happens exactly once; there is no re-evaluation of early start once `playing` (**the expected human seats are frozen at start time**). Join identity checks always use the participant table's userId → slot mapping; `humanSlots` is never used for authorization. During `playing`, seat status can be checked against the §7 grace-30-second table; an abandoned participant past grace expiry is never restored as a player (they may still watch, once the spectator path in §5-E is implemented — B-17, required as of 2026-08-08).
- No cancel UI is provided after a match forms (no LoL-style accept dialog; the transition is automatic, prioritizing evaluation-demo pacing).
- The lobby WS disconnecting after a claim does not cancel the match. Unconnected users are AI-ified by the existing GameRoom's 10-second wait. This avoids a race between an in-flight async creation's leave and its commit.

### 4-D. Matchmaking state machine (user's perspective)

```text
idle ──queue_join──► queued ──sync claim──► starting_match ──B-09 success──► in_match
  ▲                    │                       │failure rollback               │
  └──queue_leave/disconnect──┘                 └──connected───► queued        │
  ▲                                            └──not connected───► idle      │
  │                                                                          │
  └────────────── match_end / closed before start ◄───────────────────────────┘

idle ──room_create/room_join──► in_room ──room_start claim──► starting_match
  ▲                                  │                          │failure rollback
  └────room_leave/grace expiry──────┘                          └──► in_room
```

Out of scope (not implemented): simultaneous party queueing, rate/rank-aware matching, tournaments, spectator queueing. Spectating itself is **in scope and required** as of 2026-08-08 (B-17 / GV-12) — what stays out of scope is *queueing* to spectate; a spectator joins a known room directly via §5-E.

### 4-E. The sole B-08 → B-09 handoff: immutable MatchPlan

B-08 never creates a GameRoom directly. The result of a synchronous claim is passed exactly once, as the following immutable data, into B-09's `prepareMatch`.

| field | contents |
|---|---|
| `token` | An internal unique ID per claim; used to detect staleness on commit/rollback, never sent on the wire |
| `source` | `quick(full\|manual\|timeout)` or `custom(code)` |
| `mode` | `rsp` / `fps` |
| `rules` | canonical rules from §4-B |
| `seats` | full-capacity `{slot, user_id\|null, display_name\|null, is_ai}` |
| `participants` | humans only: `{userId, slot}`; GameRoom's identity table |
| `human_slots` | list of human slots; GameRoom's early-countdown check |
| `rollback` | quick: original `joined_at/sequence`; custom: the pre-freeze LobbyRoom snapshot |

Every array and the rules are copied and frozen at claim time; the original queue/LobbyRoom is never referenced afterward. Even though Node is single-threaded, other messages get processed during `await GameRoom.create()`, so "check, then await, then delete" is never valid. A claim completes the following steps with no `await`:

1. Re-verify current context / room state / leader.
2. Move all target users into `starting_match` with the same token.
3. Remove the quick entry from the queue, or set the LobbyRoom to `starting`.
4. Build the immutable MatchPlan.
5. Exit the synchronous section, then `await` B-09.

B-09 calls the existing `createRoomFromRules({mode, rules, participants, humanSlots})`. On success, it verifies the `token` matches, moves all users to `in_match`, deletes the custom LobbyRoom (invalidating the code), then sends `match_found`. On failure, only users with that same token are rolled back. For quick match, only users with a current lobby connection are reinserted at their original position; a user who disconnected or logged out during generation is not reinserted and instead returns to `idle` (auto-requeueing a disconnected user's queue slot is prohibited). For custom, the room returns to `open`; a participant with no connection due to an ordinary disconnect is given a 10-second room reconnect grace measured from the rollback point. A participant with explicit logout / session expiry leaves immediately, and then host handoff or dissolution proceeds. Connected targets receive `internal_error` plus the latest state. A double `room_start`, a simultaneous fill-start and timeout, or a simultaneous full-join and timeout — in every case only the first claim succeeds; later ones get `room_starting` / `already_in_game`.

`prepareMatch(plan, {signal})` has a 5-second deadline and accepts an injected fake timer. On timeout it calls `AbortController.abort()` and performs a failure rollback. B-09 changes the existing `reserved Set` into a `Map<roomId, reservationToken>`, and on abort removes **only the reservation matching its own token**. Since a Promise itself can't be cancelled, if GameRoom creation succeeds after the deadline, it is never registered into the registry and is closed immediately instead. Even on ordinary success, all participants' token match is verified **as a single batch** before commit; on any mismatch, `closeRoom(roomId)` discards the already-created GameRoom. Partial commits, orphaned GameRooms, and lingering `reserved` entries are never permitted.

To return `in_match → idle` when a match ends, B-09 subscribes to the GameRoom lifecycle. Participants are released on either `match_end` (finished) or "closed after 10 seconds with zero humans." Since current GameRoom has no notification for a pre-start close, B-09 adds an `onLifecycle(state, reason)` hook to RoomOptions / the rooms registry. The lobby must never poll GameRoom internal state. When `finished`, user context is set to `idle` even while the result screen holds the connection open for 60 seconds, so the user can immediately join a new queue.

### 4-F. B-08 implementation layout

| file | responsibility |
|---|---|
| `app/shared/src/ws/lobby.ts` | All zod schemas / wire types for this section. Exported from `ws/index.ts` |
| `app/backend/src/lobby/state.ts` | UserContextRegistry, presence derivation, connection/token-based commit/rollback |
| `app/backend/src/lobby/queue.ts` | Per-mode FIFO, leader deadline, queue_state, quick-match MatchPlan claim |
| `app/backend/src/lobby/rooms.ts` | LobbyRoom, code issuance, host handoff, room MatchPlan claim |
| `app/backend/src/lobby/ws.ts` | `/ws/lobby`, authentication, dispatcher, sending, replacement, resend |
| `app/backend/src/ws/connection.ts` | heartbeat, session_id index, pre-auth bound, and other parts shared by game/lobby |
| `app/backend/src/lobby/lobby-check.ts` | fake-clock deterministic checks + real-WebSocket integration checks |

`app/backend/src/game/rooms.ts` remains the GameRoom registry unchanged; LobbyRoom is not mixed into that file. `index.ts` registers `registerGameWs` and `registerLobbyWs` in the same scope, after the websocket plugin registration.

---

## 5. Game WS spec (`/ws/game/:roomId`)

The formalization of the 5 message families `join / input / snapshot / event / spectate` from ARCHITECTURE §2.3.

### 5-A. Client→server

| t | d | notes |
|---|---|---|
| `join` | — (identity is via Cookie plus the room's participant registration; no payload needed) | Same message for both first join and reconnect. A non-participant closes with `4003` unless the §5-E spectate conditions are met |
| `input` | `seq`, `yaw`, `mv`, `act?` (table below) | Fixed 30Hz send rate |
| `leave` | — | Explicit resignation/leave (skips the disconnect grace, AI-izes the seat immediately; FPS forfeits immediately) |
| `spectate` | — | Join as spectator (§5-E). **Required as of 2026-08-08** — the spectator module is part of the declared +5pt bonus (B-17) |

**`input` field spec** (mapped to the sim layer's `t_input`; logical axes follow the existing `t_axis`):

| field | type | contents |
|---|---|---|
| `seq` | uint32, monotonically increasing | For discarding out-of-order/duplicate messages. The server silently discards anything smaller than the last-accepted `seq` |
| `yaw` | float | **Absolute value, radians**. Viewpoint rotation is applied immediately client-side (the sole confirmed prediction), so the server adopts the client's reported value. Server-side validation is limited to [-π,π) normalization and a finite-value check (rotation cheating is documented as an accepted risk: the game rules never create an aiming advantage from it, and it isn't cost-effective to guard against for a LAN evaluation) |
| `mv` | uint4 bitmask | bit0=forward / bit1=backward / bit2=strafe-left / bit3=strafe-right (rotation keys are not included; rotation is folded entirely into `yaw`, and the client's key→yaw integration reuses the existing render-side logic) |
| `act` | uint4 bitmask (optional) | Reserved for compatibility with the existing engine's weapon/fire state. Fixed at 0 for both modes in this project |

> **Revision (2026-07-11)**: the originally-present `hand` field (RSP's chosen hand-sign) has been **removed** (⑤ [BACKLOG.md](./backlog.md) D-17). Hand is state the server changes authoritatively on respawn / entering one's own zone; under the current rules there is no concept of a player choosing a hand. Exposing it in the input surface would only open a door to cheating and inconsistency.

- **Send convention**: the client thins its display-frame rate down to **30Hz and sends the full state each time** (state-driven, not event-driven). Even under packet loss (which, apart from the WS closing, doesn't otherwise occur), the next message carries full state, so it self-heals. The server keeps the latest `input` per seat and **applies it via `game_set_input` on every tick** (§3-B).
- Input is accepted only during `playing` (silently discarded during waiting/countdown/finished).

### 5-B. Server→client

| t | d | trigger |
|---|---|---|
| `welcome` | `v`, `role: player\|spectator`, `slot`, `combatant_id`, `mode`, `rules`, `map_text`, `tick_rate: 30`, `snap_rate: 15`, `interp_ms: 100`, `resume: bool` | Immediately after a join/spectate is accepted |
| `snapshot` | §5-C | 15Hz (once every 2 ticks). The **same serialized string** is delivered to all participants and spectators (no per-client customization) |
| `event` | §5-D | On occurrence |
| `player_status` | `slot`, `state: connected\|ai\|grace` (grace = in disconnect grace period) | On a seat's human/AI switch |
| `error` | §2-C | — |

> **On the `resume` determination (added 2026-07-27)**: `resume=true` can only be set when the seat is known to be **in the §7 grace state** — and per-seat grace state is owned by **B-12**. So **in B-11 alone, `resume` is structurally always `false`**. This is documented explicitly so a reader of the implementation doesn't mistake it for a bug. It's correctly populated only once B-12 adds the per-seat status table.

**Map-distribution decision**: `welcome.map_text` **bundles the server's already-loaded `.cub` text**.

| option | pros | cons | verdict |
|---|---|---|---|
| **Bundle `.cub` text in welcome (adopted)** | Server/client map mismatch is structurally impossible (single source of truth). Adding a custom map requires zero additional distribution work | `welcome` grows by a few KB (harmless since it's one-time) | Adopted |
| Fetch static assets | `welcome` stays light | Risk of drift between the asset and what the server loaded; more versioning to manage | Rejected |

The client passes `map_text` to the render side's `game_create` (for display) (the same path as §3-B's "in-memory `.cub` text" argument — native/web/server all run through the same parser). Textures remain static assets as before (`.tex`, per E-06).

### 5-C. snapshot payload (1:1 with §3-D)

```json
{ "t":"snapshot", "d":{
  "tick": 12345,
  "match": { "state":"waiting|playing|finished", "mode":"rsp|fps",
             "winner": null|0|1|combatant_id, "score":[7,4] },
  "combatants":[
    { "id":0, "team":0, "hand":0|1|2, "pos":[12.5,4.25], "dir":1.57,
      "alive":true, "is_ai":false, "respawn_ms":0 } ],
  "world_delta": { "collected":[[3,4],[7,2]], "doors_open":true }  // only when changed, FPS only
} }
```

| field | §3-D correspondence | note |
|---|---|---|
| `tick` | tick | server tick counter (30Hz count; distributed on even ticks) |
| `match.state` | match state | the sim's enum, unchanged (waiting/playing/finished). Countdown is expressed **as a room-layer event, not as an extension of the sim enum** (to avoid modifying §3-D) |
| `match.mode` | — (newly introduced here, §5-C) | `rsp` \| `fps`. Ensures **`match.winner`'s meaning (RSP=team number / FPS=combatant_id) can be resolved from the snapshot alone** (required for the acceptance-item #5 spectate/replay/recording use cases). Same as welcome's mode, unchanged during the match. A couple bytes, no impact on the 1KB size budget |
| `match.winner` | winner | RSP=team number / FPS=combatant_id / undecided=null. **Interpretation is fixed by `match.mode`** |
| `match.score` | score | RSP=per-team `[A,B]` / FPS=fixed `[0,0]` (win/loss determined only by reaching the goal) |
| `combatants[]` | id/team/hand/pos(x,y)/dir_angle/alive/is_ai/respawn_timer | FPS's enemy hazards use the same shape (the client draws them without distinguishing). `respawn_ms` is the remaining time in milliseconds |
| `world_delta` | collected item positions, door-open flags | **Processed only when present** (a delta; on first join/reconnect the very first snapshot right after welcome always includes the full state) |

- Size budget: stays under **1KB per message** with 4 players + several enemies (§3-D). Adding a field must be checked against this budget as an acceptance criterion.
- **Interpolation contract (client responsibility)**: buffer snapshots and linearly interpolate between the two straddling `now - 100ms` (angles via shortest arc). Only your own `yaw` prefers the local value (immediate viewpoint-rotation application). The interpolated result is written into the display-side `t_game` via `game_apply_snapshot` and rendered via `render_frame` (matching §3-B's division of labor — **the client contains no win/loss-determination code**).

#### Why distribution is at 15Hz (relative to sim's 30Hz and 60fps rendering)

> **A premise to confirm**: interpolation is **not** "make one picture from two snapshots." It's the process of producing the state at **any arbitrary time between** two snapshots. `alpha` is a continuous value from 0.0 to 1.0, so **the same two snapshots get reused across many frames while alpha varies** (at 15Hz, about 4 frames per pair). So **the distribution rate does not cap the rendering fps**. Even at 15Hz, 60fps still renders.

What distribution rate actually changes is **not smoothness, but these two things**:

| what changes | at 15Hz |
|---|---|
| **bandwidth** | half of 30Hz. downlink ~500B × 15Hz ≈ 7.5KB/s/client (§9) |
| **trajectory accuracy** | interpolation draws a straight line between two points, shortcutting 66.7ms worth of curvature. At walking speed this is on the order of a few cm — imperceptible visually |

**15Hz is chosen as "the lightest rate that still fits inside the 100ms interpolation delay."** Interpolation always needs "two snapshots straddling the moment being drawn," and the `now - 100ms` delay is that margin.

| distribution rate | snapshot interval | against the 100ms budget |
|---|---|---|
| 30Hz | 33.3ms | 67ms of slack (excessive — no payoff for doubling the bandwidth cost) |
| **15Hz (adopted)** | **66.7ms** | **33ms of slack — absorbs the jitter/delay of one dropped frame** |
| 10Hz | 100ms | zero slack — losing one frame means no interpolation is possible and position jumps |

Note that §2.3's "15-20Hz" wording refers to this range in general, and since **distributing only on even ticks = exactly 15Hz** is the most straightforward implementation of §6-A, that is what's adopted.

**External validation**: the 100ms interpolation delay was derived independently (from the 100ms/15Hz budget above), but it happens to match the Source engine's own default `cl_interp` of 100ms, which is likewise derived from covering one dropped snapshot at its default 20Hz update rate — see [Source Multiplayer Networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking) (Valve Developer Community). That reference also documents two techniques this project deliberately does **not** adopt — full client-side movement prediction and server-side lag compensation (rewinding other players' positions for hit detection) — because RSP/FPS use contact/collection-based hit tests, not the millisecond-precision aim registration those techniques exist to fix (see the yaw-only-prediction note in §5-A above).

Also note that `web/snapshot_interp.js` **never interpolates discrete values (`state` / `score` / `hand` / `alive` / `team`); it uses the older snapshot's value as-is**, so the score can never land at a fractional 0.5 — the same "the browser never makes a judgment call" principle as elsewhere in this section.

### 5-D. event types

A closed enumeration built around the 4 types from ARCHITECTURE §2.3, plus room-layer events.

| kind | d | occurs |
|---|---|---|
| `countdown` | `seconds: 3` | when the connection wait completes |
| `match_start` | — | when countdown expires (state=playing from this point) |
| `point_scored` | `team`, `score:[a,b]`, `by_id` | on an RSP score (a presentation/SFX trigger; the source of truth for the value is the snapshot) |
| `hand_changed` | `id`, `hand` | on a hand-sign change (same as above) |
| `goal` | `id` | FPS goal reached |
| `match_end` | `winner`, `reason: score\|goal\|forfeit\|abandon`, `match_id:int\|null` | decision reached. `match_id` is the positive integer of the persisted DB row (the result screen fetches details via REST). **Fires after persistence completes, per the ordering in §6-C**. It is null only when persistence fails, since there is then no DB row — and `match_result` is also never sent in that case. The client shows the result screen using only the final snapshot's win/loss and score |
| `player_disconnected` | `slot`, `grace_ms: 30000` | disconnect detected (→ player_status: grace) |
| `player_reconnected` | `slot` | reconnected within the grace period (→ player_status: connected) |
| `ai_takeover` | `slot` | grace expired, or AI-ized by `leave` (→ player_status: ai) |

Events are **presentation/notification triggers**; the source of truth for game state is always the snapshot (the design tolerates dropped events since state always catches up via snapshot — events are never resent on reconnect).

### 5-E. Spectate hook (**required as of 2026-08-08** — B-17; previously a 保1 stretch item)

- A connection that sends `spectate` is **simply added to the snapshot/event delivery set** (`welcome.role=spectator`, `slot=null`). Its `input` is silently discarded.
- Viewpoint switching is entirely client-side (since the snapshot includes pos/dir for all combatants, `render_frame` can render from any combatant's viewpoint — zero added server cost).
- Eligibility: any logged-in user, during `playing`.
- **Getting to a room without a listing API.** ③ has no room-listing endpoint, and adding one is not part of
  B-17. A spectator therefore reaches a match by room id — the lobby's `match_found` and `room_state`
  already carry it, and `/game/:roomId` is a real route. Declaring the module does **not** require browsing
  live matches; it requires that watching one works.
- **Acceptance (B-17 + GV-12)**: a third browser, logged in and not seated, sends `spectate`, receives
  `welcome` with `role: "spectator"` and `slot: null`, then receives the same snapshot stream as the players
  through `match_end` — without occupying a seat, without affecting AI-takeover logic, and with its `input`
  discarded.

---

## 6. GameRoom state machine and lifecycle

**One match = one room = one `sim.wasm` instance** (finalized). Rooms are held concurrently, multiple at once, in a module-scoped Map (`room_id → GameRoom`) — the basis for the multi-user requirement.

### 6-A. State machine

```text
created ──all humans join, or 10s──► countdown(3s) ──► playing ──decided──► finished ──60s──► closed
   │                                               │(all human seats grace-expired/abandoned)
   └── 10s with zero humans ──► closed (no record)     └──► finished(abandon)
```

| state | tick-driven | accepts input | summary |
|---|---|---|---|
| created | no | no | `game_create` + `game_add_combatant` done for every seat. Waiting for connections. **Receives the "list of human seat slots" at creation time** (below) |
| countdown | no | no | `event(countdown)` → 3 seconds later `event(match_start)` |
| playing | a **30Hz `setInterval`** runs `game_step(game, 1/30)`; on even ticks, `game_snapshot` → JSON → broadcast to all | yes | the sole authoritative state |
| finished | no (final snapshot already sent) | no | persistence (§6-C) → connection held open 60s for the result screen → close 1000 |
| closed | — | — | `game_destroy`, removed from the Map |

> **Addendum (2026-07-27) — per-seat state is a separate dimension, orthogonal to room state**
>
> The table above holds only the **overall room state** (created / countdown / playing / finished / closed). Separately, §5-B's `player_status` carries a per-seat 3-value state, `connected` / `ai` / `grace`, and §7-A defines a **per-seat transition**: disconnect → 30s grace → ai_takeover. When grace expires, the seat transitions to `ai` (its input source switches to AI) and is simultaneously recorded as `abandoned` for that seat. `abandoned` is a flag separate from `player_status`, used in the end-of-match outcome (`endReason: 'abandon'`). §6-A's `finished(abandon)` refers to the room-level transition that occurs when "all human seats become abandoned."
>
> **These are two separate dimensions — grace is not being added to the room state machine.** It is entirely normal for the room to remain `playing` while seat 1 is `grace`, seat 2 is `ai`, and seat 3 is `connected`. §6-A's "playing ──(all human seats grace-expired/abandoned)──► finished" arrow expresses that **an aggregate over the seat dimension triggers a room-level transition**. B-12 must implement this as a new per-seat status table (not as an extension of the room state machine).
>
> ---
>
> **Addendum (2026-07-27) — the room receives the "list of human seat slots" at creation time**
>
> §4-C defines the transition condition into countdown as "**all human seats' join complete**, or 10 seconds elapse" — but the room creates every seat with AI (§6-B), so **it has no way of knowing on its own which slots are human seats**. That assignment is known on the matchmaking side (the slot assignment in §4-A, the AI fill for missing seats), so the spec is: **the list of human-seat slots is passed at GameRoom creation time**.
>
> | | |
> |---|---|
> | passed by | matchmaking (B-09). For quick match, derived from the head of the queue; for custom room, derived from `seats[]` |
> | received by | GameRoom (B-10). Stored as `humanSlots: number[]` |
> | used for | the early transition to countdown (**once every slot in this list has joined, proceed without waiting the full 10 seconds**) |
> | if omitted | all seats are treated as human (same as the quick-match case where capacity is filled exactly) |
> | `[]` (empty array) | no human seats (an AI-only room). The early-countdown condition does not apply; transitions to countdown on the default 10-second timeout instead. The countdown check must verify `humanSlots.length > 0` |
>
> **Without this, a match with 2 humans + 2 AI seats would always wait the full 10 seconds** (the early-start condition would become "the full mode capacity of humans is present," which would then never be satisfied). `humanSlots` is used solely for early-countdown timing; join authorization always comes from the `participants` table. A slot registered as a participant remains eligible as a reconnect target during grace even after being removed from that list, but a slot that was assigned as AI from the start and never registered can never be claimed by a different user. Any slot **not in participants, or outside the seat capacity, is rejected with close `4003`** (not authorized to join).

### 6-B. Correspondence with sim API (§3-B)

| room event | sim API called | notes |
|---|---|---|
| room creation | `game_create(cub_text, mode, match_rules)` | §4-B's `map` is resolved to cub_text by B-14; only RSP's `target_score` goes into the current `match_rules`. `humanSlots` is GameRoom-side application metadata, not added to the sim API |
| seat finalization | `game_add_combatant(game, slot, is_ai)` × capacity | Unconnected human seats are **also generated as AI first**, and switched to input source EXTERNAL on join (addendum below) |
| `input` received | held in the seat's buffer → applied via `game_set_input(game, combatant_id, t_input)` every tick | Mapping `mv`/`yaw`/`act` → `t_input` is the responsibility of the platform/headless layer (`hand` was already removed from `input` per D-17 — hand is decided server-side by the engine). The implemented wrapper is `sim_set_input(game, id, forward, backward, strafe_left, strafe_right, yaw)` |
| tick | `game_step(game, dt=1/30)` | the return value (in-progress/decided) determines the `finished` transition |
| distribution | `game_snapshot(game, buf)` → JSON-encoded in JS | serialization happens on the Node side; nothing is stringified inside wasm |
| destruction | `game_destroy(game)` | at the `closed` transition |

> **§3-B addendum request (the sole engine-API addition originating from this document)**: the design in §3-C for AI substitute ⇔ restore on disconnect is "just a swap of input source," but §3-B's public API table has no matching function. **`game_set_input_source(game, combatant_id, AI|EXTERNAL)` must be added to the public API.** Include this function in the acceptance criteria for E-10 (sim public API) and G-02 (input source abstraction) (reflected in the ⑤ backlog).
>
> **Resolved (2026-07-23)**. This addendum request has been implemented on the engine side and is exposed as `game_set_input_source` in [`codes/includes/platform/sim.h`](../../codes/includes/platform/sim.h). **No remaining work on the engine side.** All six sim APIs in the table above are implemented; the concrete call-order procedure is written up in the "handoff to B-10" section of [3-エンジンPhase3レポート](../../archive/03_実装レポート/3-エンジンPhase3レポート.md).

### 6-C. Persistence and result delivery at match end

1. Send the final snapshot (`match.state=finished`). At this point the client already knows the outcome and final score (source of truth is still the snapshot).
2. Write `Match` + `MatchPlayer` via Prisma (**AI seats are recorded as rows too**, per §3.3). `result` attribution rules:

| case | recorded as |
|---|---|
| ordinary decision (score/goal) | winning side win / losing side lose |
| FPS forfeit | remaining side win(reason=forfeit) / departed side **abandon** |
| RSP: left mid-match and never returned before decision | that user is **abandon regardless of team outcome**. If they reconnected, the ordinary outcome applies |
| all humans left, match cut short | `winnerTeam=null`; every departed user is abandon (AI seats are treated as draw and excluded from statistics) |

3. **Deliver `event(match_end)` over the game WS** (`d.match_id` carries the positive integer assigned in step 2; it is null, with a failure log, only when persistence fails). **This order (persist → match_end) must never be reversed.** The implementation starts persistence right after the final snapshot and sends only after `await`-ing it.
4. `match_result` is broadcast over the lobby WS (§3-A) only on successful persistence, including the same `match_id` as the DB row, sent after the game WS's `match_end`. On failure, since there is no DB row or ID, `match_result` is never fabricated.
5. Close with 1000 after 60 seconds → `game_destroy`. Result-screen details (history, stats reflection) are fetched via REST (③). **The 60-second count starts at the moment `event(match_end)` fires** (to avoid a truncated window if persistence takes a long time).

B-09 hands GameRoom a persistence closure that captures the MatchPlan. Since the `PersistedMatchContext` outcome alone (winner/reason/score/tick) can't build `MatchPlayer`, map, and settings, the closure combines it with the MatchPlan's `seats / participants / rules`. `createRoomFromRules` currently forwards `persistMatch` and `onMatchResult` straight through to RoomOptions. `persistMatch` returns `{matchId:int, result:match_result payload}`, and GameRoom calls `onMatchResult(result)` immediately after sending `event(match_end).d.match_id=matchId` over the game WS. B-09/B-13 wire that hook to the `match_result` broadcast to all lobby connections. On null/exception, `match_end` is sent with null and the hook is never called.

---

## 7. Disconnect, reconnect, and AI takeover (the core demo for the "Remote players" module)

> **B-12 implementation complete (2026-07-30)**: `GameRoom` holds, as the source of truth, each participant seat's `connected / grace / ai` state and whether restoration is allowed. An ordinary close switches to AI input immediately and starts a 30-second grace; the same user rejoining gets `welcome.resume=true` plus an immediate snapshot restoring them; after expiry, restoring as a player is refused. Full RSP grace-expiry is an abandon; FPS expiry / explicit leave is a forfeit. The real-WebSocket check in `game/ws-check.ts` confirms §10-B #4 and the handoff of departed seats to the persistence callback.

### 7-A. Flow (RSP example)

```text
[disconnect detected] game WS close / 2 consecutive ping non-responses
   │ player_status(slot, grace) + event(player_disconnected, grace_ms=30000)
   │ the seat's input is immediately taken over by AI … game_set_input_source(id, AI)
   ▼
[reconnected within 30s grace]              [grace expired]
   │ same user connects to /ws/game/:roomId   │ event(ai_takeover)
   │ and sends join                           │ from here on this seat stays AI
   │ → identity confirmed via userId-to-seat    for the rest of the match (the human
   │   mapping                                  can only spectate if they return)
   │ → welcome(resume=true) + the immediately-
   │   following snapshot carries the full
   │   world_delta
   │ → game_set_input_source(id, EXTERNAL)
   │ → event(player_reconnected)
   ▼
[restore complete] back to human input
```

- **Identity is confirmed via session Cookie only** (no dedicated reconnect token is issued; ARCHITECTURE §2.3's "session token" is interpreted as referring to the login session, avoiding a duplicate token scheme). If the session has expired, the user goes to the login screen — restoration is still possible after re-login, as long as it's within the grace period.
- FPS 1v1: the match continues during grace (AI plays in the user's place). **Grace expiry is a forfeit** (`match_end(reason=forfeit)`). If both players disconnect, whichever grace expires first is the abandoning side.
- `leave` (explicit exit) triggers `ai_takeover` immediately, with no grace (FPS forfeits immediately).
- RSP, when all human seats reach grace/ai: **AI-only play continues for the duration of the 30-second grace window** (waiting for anyone to return). Once every seat's grace has expired, it's cut short as abandon (§6-C).

### 7-B. Evaluation demo script hook

Closing a tab → logging in from another tab → re-entering `/game/:roomId` → restoring, must complete within 30 seconds (the rationale for D-3's chosen value). `player_status` drives a "disconnected (AI)" indicator on other players' screens, handed off to the HUD spec (④).

---

## 8. Failure modes, security, and performance budget

| item | spec |
|---|---|
| input validation | Every message goes through zod (shared) + server-side semantic validation (yaw finiteness/range, seq monotonicity, rules range/map existence/mode match, context/host authorization). This double validation is the WS-side evidence for the "validated on both FE and BE" requirement |
| backpressure | The game WS drops only the `snapshot` (never `event`) once its send buffer exceeds 64KB. The lobby WS holds every notification. Both close with 4005 above 1MB (treated as a dead connection) |
| lobby contention | queue/LobbyRoom/context changes and MatchPlan claims happen with no `await`. Async completions commit/rollback via token comparison, preventing double-start or being overwritten by a stale completion |
| tick overload | A warning is logged (candidate metric for monitoring stretch-item 4, 監視保4) if `game_step` takes over 50% of its period. No cap is placed on room count (unnecessary at the evaluation scale of 4 players × a few rooms; confirmed by the Day-12 load test) |
| time | No clock sync with the client. Interpolation runs on "relative time based on arrival time" (render time derived from the interval between snapshot arrivals; an NTP-like mechanism is YAGNI) |
| logging | Connect/disconnect, queue join/leave, room create/join/leave, claim/rollback, match forming, and persistence are structured-logged (pino). Cookies, raw tokens, and game input are never logged |
| bandwidth estimate | Downlink: ~500B × 15Hz ≈ 7.5KB/s/client. Uplink: ~60B × 30Hz ≈ 1.8KB/s. The demo uses 4 windows (§10-5), but **even at 8 windows the total stays comfortably under 100KB/s** |

---

## 9. Consistency checklist (cross-check against the source-of-truth decisions)

| source-of-truth decision | where it's covered in this document |
|---|---|
| WS 5 families join/input/snapshot/event/spectate | §5-A/5-B (names kept as-is; lobby-related types are outside the 5 families, being a separate endpoint) |
| input(seq, keys, yaw) | §5-A `input{seq, mv, yaw, act}` (keys→mv+act made concrete; `hand` removed per ⑤ D-17, since hand is server-authoritative state) |
| snapshot(tick, combatants[], score) / all §3-D fields | §5-C correspondence table (tick/match/combatants/world_delta exact match) |
| event(point_scored, hand_changed, goal, match_end) | §5-D (built around the 4 core types, with room-internal events added) |
| sim at 30Hz / distribution at 15-20Hz / 100ms interpolation | §6-A (30Hz tick, even-tick distribution = 15Hz) / §5-C interpolation contract (100ms) |
| prediction limited to viewpoint rotation | §5-A yaw client authority + §5-C "only your own yaw prefers the local value" |
| disconnected seat → AI substitute → restore / FPS forfeit | §7 (D-3: 30 seconds) + §6-B addendum API |
| one match = one room = one sim.wasm, concurrent multiple | start of §6 |
| spectate = read-only subscription, near-zero added cost | §5-E |
| AI seat = only a difference in input supplier | §6-B (generated as AI first → switched to EXTERNAL) |
| matchmaking is shared infrastructure across both games | §4-A (two per-mode queues on one shared mechanism) |
| one-user-one-context / presence | §3-E (derived from UserContextRegistry; queue/room never a duplicate source of truth) |
| no contention or double-forming under concurrent operations | §4-E (synchronous claim + token-based commit/rollback) |
| immediate logout invalidation / WS Origin | §3-D (both WS closed via session_id index) + §1 |
| B-08/B-09 responsibility boundary | §4-E (B-08 = immutable MatchPlan; B-09 = GameRoom creation and lifecycle integration) |
| JSON to start, binary is YAGNI | §2-A + §5-C size budget (under 1KB/message as an acceptance criterion) |
| game_create/add_combatant/set_input/step/snapshot/apply_snapshot/destroy | §6-B correspondence table (the sole addendum = `game_set_input_source`) |

## 10. Acceptance criteria (seeds for ⑤ backlog B-xx/GV-xx)

### 10-A. Completion criteria for B-08 alone

`app/backend/src/lobby/lobby-check.ts` automatically checks the following; a zero observation count on even one item is a fail.

1. **Connection**: with correct Origin/Cookie, the first message is `lobby_hello(v=1)`. Unauthenticated → 4000, wrong Origin → 4003, >4KB → 4001, 10 violations → 4001, same-user replacement → 4004. The new socket's context survives the replaced old socket's close.
2. **heartbeat/session**: cleaned up after 2 missing-pong cycles; the logout hook closes both lobby and game for the same session with 4000. Timer/connection Maps are empty (0 entries) after the test.
3. **FIFO**: RSP/FPS are independent, and same-timestamp entries are ordered by sequence. On every join/leave, all remaining members' `position/waiting/is_leader` are correct. A disconnected entry leaves immediately.
4. **forming claim**: across the 3 paths — full capacity, leader-manual, and fake-clock 60-second timeout — exactly one MatchPlan each. Even under simultaneous fill-start/timeout, double room_start, or simultaneous full-join/timeout, the total is 1.
5. **rollback**: deliberately fail B-09 and confirm connected quick participants return to their original FIFO order, custom rooms return to `open` with the same host/rules/seats, and a stale token's delayed completion never changes state. A quick participant who disconnected during generation is not reinserted; a custom room's ordinary disconnect gets a 10-second grace; logout leaves immediately. No GameRoom / `reserved` entry / timer remains after a delayed success following the 5-second timeout.
6. **LobbyRoom**: code-collision retry, lowercase join, full room, non-host rejection, `target_score=2/22` rejection, mode-mismatched map rejection, host handoff, deletion when everyone leaves.
7. **reconnect**: a room member restores to the same seat at 9.9 seconds and leaves at 10 seconds expired. A `queued` context never auto-restores on reconnect; `in_match` gets `match_found` resent.
8. **presence**: with a fake friend relation A-B and non-friend A-C, A's 4 state changes reach only B. Even with an async resolver completing out of order, a stale version is never delivered after the fact. `online_count` is unaffected by replacement.
9. **wire**: reparse every sent/received message against `lobbyClientMessageSchema` / `lobbyServerMessageSchema`; `room_state` uniquely distinguishes empty/AI seats via null and is_ai. Every ID's type matches ③ D-10.
10. **dev path**: a Cookie-bearing connection succeeds even through Vite's same-origin `/ws` proxy.

B-08's completion is not "the match runs" — it's the above, plus **exactly one immutable MatchPlan generated via both start paths**. GameRoom creation, `match_found`, and releasing a pre-start close are B-09's integration criteria.

### 10-B. Full E2E criteria including B-09 and beyond

1. With 2 browsers + 2 AI seats, an RSP quick match forms, reaches the target score → `match_end` → DB row → receiving `match_result` in the lobby, all working end to end.
2. A match forms via both the "Fill with AI and start now" button and the 60-second auto-start path.
3. Custom room: join via code invite → host sets `target_score=3` → start → decided at 3 points.
4. Closing a tab mid-match and re-entering within 30 seconds restores the human (other screens show the grace/ai/connected transition). In FPS, 30 seconds idle records a forfeit.
5. Load testing measures snapshots at under 1KB/message. **No console errors in the two demos below.**

   > **Revision (2026-07-27): dropped "8 browsers simultaneously" in favor of two 4-window demos.**
   >
   > With a 4-person team and 1 evaluator, 8 windows would mean **everyone operating 2 windows each**, which is impractical. Also, opening 8 windows on one machine means `render.wasm` runs 8 instances competing for the same CPU (E-13's measured 960×540=112fps is **a single-instance figure**). Since the requirements being demonstrated are distinct, **splitting into two demos lets both fit in 4 windows each**.
   >
   > | | requirement shown | configuration |
   > |---|---|---|
   > | **Demo A** | core #3, 3+ multiplayer (Major, 2pt) | **1 room, 4 humans, 0 AI seats** |
   > | **Demo B** | subject spec III.2, multi-user concurrency (**a disqualifying condition**) | **2 rooms, each "2 humans + 2 AI" = 4 windows total** |
   >
   > **It matters that Demo A uses no AI seats.** If every room were "2 humans + 2 AI," "3 or more" would be counted partly via AI, weakening the #3 2pt claim.
   >
   > **The key point of Demo B is that it's 2 rooms** — the headcount per room isn't the point. III.2's "concurrent user actions must not cause data corruption or race conditions" can **only be demonstrated by two independent rooms writing to the same DB and the same lobby at the same time** (with a single room there's no scenario for contention to occur — it would only show "nothing broke" because no breaking situation was ever created, not that it can't break).
   >
   > **Connect from 4 separate physical machines if at all possible.** Core #2, remote players (Major, 2pt), explicitly requires the subject spec IV.6's "real-time play **between separate machines**"; a single machine with 8 windows makes this 2pt claim weak. Separate machines let #2, #3, and III.2 all be demonstrated simultaneously, and rendering load drops to one window per machine. **In that case, install the mkcert CA on every machine** (per ⓪ §9.1). nginx must be listening on the LAN name, and `ALLOWED_ORIGIN` (B-05) must allow it — also within I-15's scope.
6. Malformed messages (schema violations, oversized payloads, seq going backward, out-of-range rules) all produce the specified error/discard behavior.

---

## Revision history

| date | content |
|---|---|
| 2026-07-11 | §5-A/§9: removed `input.hand` (⑤ [BACKLOG.md](./backlog.md) D-17; alternatives comparison in ⑤ §0) |
| 2026-07-23 | §6-B: noted that the "§3-B addendum request" is **implemented** (`game_set_input_source`). Corrected the leftover `hand` reference in that table (already removed per D-17) to `act`, and added the implemented wrapper `sim_set_input`'s arguments. Reflowed long lines for readability |
| 2026-07-29 | Resolved 4 design gaps (filling holes before the B-08–B-13 implementations): added addenda for room-code issuance atomicity, freezing expected human seats, snapshot's mode, and firing match_end after persistence. Reflected in `room.ts` and `game.ts` |
| 2026-07-30 | **B-08 design complete**: fixed the I-01/B-10/B-11/B-14 implementation patterns into §0-A. Added the full lobby wire type set, UserContextRegistry, friend-restricted presence, 10-second replacement/room reconnect, heartbeat/session expiry, FIFO deadline, LobbyRoom canonical rules, synchronous claim + token rollback, the immutable-MatchPlan-based B-09 boundary, implementation layout, and the 10-item B-08 acceptance list. Removed the unimplemented speed multipliers/AI strength from the wire. Corrected the old "restoration allowed after grace expiry" note and the impossible old note about "rescuing a persistence failure via match_result" |
| 2026-07-30 | **B-08 core implementation**: implemented `shared/ws/lobby.ts`, `backend/src/lobby/`, the shared `ws/connection.ts`, `/ws/lobby`, and the Vite `/ws` proxy. `npm run check:lobby` checks FIFO / the 3 forming paths / rollback / LobbyRoom / grace / presence / real WS / heartbeat / session index. Real Cookie authentication, DB profile lookup, and the logout hook call await integration with B-04/B-05 |
| 2026-07-30 | **B-09 implementation complete**: `lobby/match.ts` connects the immutable MatchPlan to a real GameRoom. Implemented token commit/rollback, the 5-second abort, reservation tokens, discarding delayed successes, `match_found`, and context release via GameRoom lifecycle. `npm run check:lobby` automatically checks manual/60-second/full-capacity forming, the 10-second zero-human close, generation failure, timeout, and zero lingering reservations |
| 2026-07-30 | **B-12 implementation complete**: implemented per-participant seat state in GameRoom, wiring up immediate AI substitution + 30-second grace on ordinary close, same-user restoration, refusing restoration after expiry, RSP abandon, FPS forfeit, explicit leave, and handing departed seats off to the persistence boundary. A real-WebSocket check automatically confirms §10-B #4 |

## Implementation notes: B-10 (GameRoom + sim.wasm integration)

These are retained implementation-detail notes carried over from the original Phase 3 report; B-10 itself is complete.

1. **Authoritative call order**: `createCub3DSimModule()` → `sim_create(cub_text_ptr, is_rsp, target_score, seed)` → `game_add_combatant(game, slot, is_ai)` × capacity (RSP=4 / FPS=2, **returns a `combatant_id`, distinct from `slot`**) → (on join) `game_set_input_source(game, combatant_id, EXTERNAL=1)` **using the id returned by `game_add_combatant`, not the raw seat `slot`** → every tick `sim_set_input` → `game_step(game, 1/30)` (return value 1 means transition to finished) → on even ticks `game_snapshot` → JSON-encoded and tick-stamped on the Node side → distributed → `game_destroy` at closed.
2. **The flat-array layout is authoritatively defined in `codes/includes/platform/sim.h`** (5 header fields + 9 per combatant, all f64). `record.mjs`'s `takeSnapshot()` is the reference implementation for JSON encoding, as-is.
3. **The seat-to-team mapping is fixed**: RSP slot 0,1 = red / 2,3 = blue. The map must have 2 red spawns (N/W) and 2 blue spawns (S/E); if not, `sim_create` returns NULL (must align with B-14's map-whitelist validation).
4. **`combatant_id` has no relation to snapshot array order** (the internal list is in reverse creation order). Both client and server must always match by id. Map-derived enemy hazards use id=8 and up.
5. `target_score` accepts only 3-21 (anything else defaults to 10). B-11's schema validation (#6) must reject outside this same range. `match_rules.seed` is **0 = time-derived (production) / non-zero = fixed RNG sequence**, and the entire match is deterministically reproducible for the same input sequence (usable in B-10's integration tests; the demo's record.mjs is fixed at seed=42, and two runs' snapshots.json have been confirmed byte-identical).
6. After a decision, further `game_step` calls stop advancing state and keep returning 1. Detect `finished` via the return value, and ticking may be halted from then on (per ② §6-A).
7. yaw is client-authoritative (per ② §5-C): `sim_set_input` directly overwrites the seat's facing. Server-side yaw range validation is unnecessary (harmless as an angle), but NaN/Inf must be rejected at the JSON schema layer (B-11).
8. Running multiple games from a single module instance has been confirmed to work, but **the design recommendation of "1 room = 1 instance" still stands** (for memory growth and crash isolation).
9. E-12's client side is `web_apply_snapshot(flat_ptr, len, view_id)` + `web_render_frame()` + the interpolation helper (GV-06 uses `app/frontend/src/engine/snapshotInterp.ts`, a TypeScript port of `web/snapshot_interp.js`; the JS original is used only by `web/sim_demo/replay.html`, so **fix both when changing interpolation**). B-11/GV-06 only need to feed the WS receive buffer into the same path in place of snapshots.json.
