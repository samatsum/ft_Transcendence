# ARCHITECTURE_DESIGN — ft_transcendence Upstream Design Document (0)

> Source: translated from the Japanese original at md_files/02_設計書/0-全体アーキテクチャ設計.md (archived).

**Project name (tentative)**: `cub3D Arena` — a browser-based multiplayer game platform built on the cub3D engine
**Team**: 4 members / **Duration**: 5 days / **AI usage**: actively used across all phases (usage is documented in the README)
**Authoritative requirements**: [ft_トランセンデンス.md](./requirements.md) (this document does not restate requirements)
**Reference materials**: [DEV_DOC.md](./dev-doc.md) / [USER_DOC.md](../ja/プレイヤーガイド.html) (authoritative for the current cub3D implementation)

> **Team-status caveat (2026-08-05)**: the "Team: 4 members" line above reflects the original design-time plan. The
> team has since dissolved; **samatsum is now the sole active contributor**. See
> [`../ja/チーム体制.html`](../ja/チーム体制.html) for the current, authoritative team status.

---

## Implementation status (as of 2026-07-30)

This document is a record from the design phase. The items below are already complete and are no longer "to be decided."

| Section | Content | Status |
|---|---|---|
| §2.1 | Engine porting strategy (Option A: C → WASM) | Complete. Gate 1 passed. All 3 targets (native / `render.wasm` / `sim.wasm`) work |
| §2.2 | C refactor (split into platform layer / `game_step` / rendering layer) | Complete. Related items (busy-wait removal, key-code abstraction, XPM pipeline, multiplayer support) are all implemented as well |
| §2.3 | Network model (server-authoritative + snapshot distribution) | Approach finalized; W-08 lobby WS core, W-09 match formation, W-10 GameRoom, W-11 game WS, and W-12 disconnect grace period are all complete. W-08 is still waiting to be wired up to the real Cookie authentication from W-04/W-05 |
| §2.4 | Web stack (selection across 9 layers) | All 9 selections finalized. 5 of the 9 are already integrated (React+Vite+TS / Tailwind / Fastify+TS / zod shared schema = W-01, WebSocket = W-11). The remaining layers are handled in W-03, W-04, W-15. The §2.4 table below includes an "Integrated" column |
| §1.2 | Two games (RSP 2v2 / FPS 1v1 race) | Engine side complete. Both games run natively and in the browser. Only online multiplayer remains |
| §3.1 | Server-authoritative sim + snapshot distribution | Lobby WS core (W-08), match formation (W-09), GameRoom (W-10), game WS (W-11), and disconnect grace period (W-12) are all complete. What remains is wiring in real authentication (W-04/W-05 → W-08) and W-13 persistence |
| §3.2 | Repository layout (monorepo) | Complete (W-01) |
| §4 | Module selection, 19pt | Selection finalized; implementation status varies per module (see the list at [the top of the requirements doc](./requirements.md)) |
| §6 §7 | Team structure & schedule | Actual operations have since changed. [6-チーム分担計画](../ja/チーム体制.html) is now the authoritative source |
| §8 | Risks | Engine-related risks (porting difficulty, pthread, state inconsistency) have been resolved |

The bulk of the remaining work is on the TypeScript server and frontend.
For the latest progress see [5-バックログ §1](./backlog.md); for ownership see [6-チーム分担計画](../ja/チーム体制.html).

---

## 0. Assumptions

This document is written against the following assumptions. If an assumption breaks down, follow the risk response in §10.

- **A1**: Evaluation happens locally on the evaluator's (or the team's) machine via `docker compose up` (a single command). No always-on public cloud deployment is required. HTTPS is established with a self-signed certificate (mkcert, etc.).
- **A2**: The team is strong in C, and intermediate or below in Web technologies (TypeScript/React/Node). AI assistance is expected to substantially boost the Web-side development velocity.
- **A3**: "RSP 2v2, first to 10 points" is defined as: each rock-paper-scissors encounter win between opposing-team players = +1 point to the winning team; the match ends as soon as either team reaches 10 points.
- **A4**: "FPS 1v1 race" is defined as: two players spawn simultaneously on the same map, and whoever reaches the goal cell first wins. The existing "collect item → open door" mechanic is reused as a gate to the goal, and the existing enemy (M) functions as an obstruction hazard.
- **A5**: The cub3D implementation state matches what's described in DEV_DOC.md (the `t_game` facade, the `main_loop` per-frame dispatcher, the three `common`/`fps`/`rsp` subsystems, `.cub` maps, CPU raycasting rendering that writes to a pixel buffer). Note: this was the assumption at design time; the §2.2 refactor has since been completed.

---

## 1. Product overview

### 1.1 Concept

The core technical pitch is "evolving a 42 C project (cub3D) directly into a browser-based multiplayer game platform."

The renderer, physics, game rules, and AI reuse the existing C assets; the Web layer (auth, lobby, matchmaking, stats, chat-like features) is newly built.

### 1.2 The two games offered (finalized spec)

| Item | RSP mode (primary) | FPS mode (secondary) |
|---|---|---|
| Format | 2 vs 2 team battle (4 players total) | 1 vs 1 race |
| Win condition | +1 point to team on a rock-paper-scissors contact win, first to 10 points | First to reach the goal cell (reuses collect → open-door as a gate) |
| Delta from existing assets | 3 NPCs → 3 remote human players (empty seats filled by AI), team score added, win condition changed | Enemies become obstruction hazards, goal-cell concept added, two simultaneous spawns |
| Corresponding module | Web-based game / Remote players / **Multiplayer 3+** (4 players) | **Another game** (with history + matchmaking) |
| Role of AI | Empty/disconnected seats are filled by the existing RSP AI → **AI opponent** module | Can be extended as an opponent (racing AI) for single-player |

The biggest asset is that RSP already has a "1 human + 3 NPC = 4 combatants" structure.

**"Replacing NPC input with input from a human over the network"** is the core idea of this design, and it is what makes Multiplayer 3+ / Remote players / AI opponent all work through the same mechanism.

---

## 2. Technology selection (trade-offs and conclusions)

### 2.1 Engine porting strategy (most important decision)

| Option | Summary | Pros | Cons | Feasibility within the schedule |
|---|---|---|---|---|
| **A. Port C → WASM via Emscripten (adopted)** | Replace MiniLibX with a thin platform layer (framebuffer + input + time); the client renders via WASM. The same C sim also runs headless as WASM inside the Node server, making the server the sole authority | Zero duplicated logic. Maximizes reuse of C assets (renderer/physics/AI/RSP rules/.cub parser). Strongest technical appeal at evaluation | Learning cost of Emscripten. Requires a refactor to strip MLX dependencies. Adds a build pipeline | Good — the renderer is structured as "just write to a pixel buffer," which pairs well with Canvas. Porting feasibility to be judged by a Day 2 spike |
| B. Full rewrite in TypeScript | Rewrite the raycaster and rules in TS | Simpler toolchain, familiar to Web developers | Discards the C assets. Reimplementing renderer + AI + physics is a quality risk. Loses the "evolving cub3D" narrative | Fair — feasible with AI assistance, but discarding a validated C implementation is a large loss |
| C. Native C execution on the server + frame streaming | Server renders and streams video | Minimal client implementation | Bandwidth/latency/scaling are unrealistic. Weak case for being a "Web app" | Rejected |

> **Conclusion: Option A.** Implementation complete. Gate 1 (the Day 2 spike) passed with a go decision on 2026-07-11; all 3 targets — native / `render.wasm` / `sim.wasm` — are now working.

**Option A's build targets** (implemented as 3 targets, native plus the original two):

| Target | Includes | Excludes | Runtime environment |
|---|---|---|---|
| `sim.wasm` (server-side) | .cub parsing, movement/collision, enemy AI, RSP win/lose, scoring, FPS goal detection | Renderer, textures, input devices, UI | Runs inside Node (Fastify) as the sole authority at a fixed tick rate |
| `render.wasm` (client-side) | Raycaster, sprite rendering, UI rendering, display state for the sim above | No X11/MLX whatsoever | Runs in the browser; renders from server snapshots |

### 2.2 Required C refactoring (implementation complete; originally scoped as boundary definitions only)

> This entire section has been implemented via E-01 through E-12.
> The heading's phrasing ("boundary definitions only") reflects the original design-time framing; the 3-layer split and all related items are now complete. See [the dev doc](./dev-doc.md) §1–§2 for current implementation status.

At design time, `main_loop` executed "input → update → collision/combat → render" as a single function every frame.

This is split into the following 3 layers (split completed; implemented as `game_step` / `render_frame` / `pf_*`):

| Layer | Content | Origin |
|---|---|---|
| **Platform layer (new, thin)** | Supplies the framebuffer, feeds input events, provides time, supplies texture byte streams. All `mlx_*` calls are replaced with calls into this layer's functions | New (on the Emscripten side, wired to Canvas / `requestAnimationFrame` / `KeyboardEvent`) |
| **Simulation layer (`game_step`)** | The part of `main_loop` with rendering removed: apply input → move/collide → enemy AI → resolve contact (rock-paper-scissors / goal) → scoring. Extended to accept an **array of multiple players' input** | `loop.c` / `camera.c` / `collision.c` / `enemy*.c` / `rsp_*.c` |
| **Rendering layer (`render_frame`)** | Takes display state (positions/hands/scores of all combatants) and writes it to the framebuffer | `screen.c` / `draw*.c` / `sprite*.c` / `rsp_weapon.c` |

Related replacement items:

- **Busy-wait removal**: The busy-wait used for the FPS cap (DEV_DOC §1) is replaced with `requestAnimationFrame` in the browser and a `setInterval` tick on the server. The `time_mult` mechanism is retained as-is.
- **X11 key-code abstraction**: `keymap.h` is moved to an enum of logical keys (forward/back/strafe/turn); physical-key mapping is owned by each platform layer.
- **XPM assets**: A build-time asset pipeline pre-converts assets to PNG/raw RGBA (conversion script assets already exist under `PythonCodes/`). Runtime XPM parsing is removed.
- **Multiplayerization**: `t_game`'s "camera = the player" assumption is generalized to "a list of combatants (human or AI) + the viewpoint is your own combatant." RSP's 4-combatant structure serves as the vessel for this as-is.
- **pthread parallel renderer**: Emscripten's pthread support requires SharedArrayBuffer plus COOP/COEP headers, which raises the difficulty, so single-threaded rendering is fixed for the initial version. Internal resolution is 640×360–960×540, upscaled via CSS. Only revisit if this proves insufficient.

### 2.3 Network model

| Option | Summary | Pros | Cons | Verdict |
|---|---|---|---|---|
| **Server-authoritative + snapshot distribution (adopted)** | The server's `sim.wasm` computes the sole authoritative state at 30Hz. Clients only send input and render from 15–20Hz snapshots with 100ms interpolation | Simplest implementation. Cheat-resistant. No determinism required (avoids float-reproducibility issues). Spectating is essentially free — same snapshot subscription | Input latency may be perceptible | Good — full state for 4 players + a few NPCs is under 1KB per update; delta compression isn't even needed |
| Lockstep (deterministic sync) | All clients run the same sim | Minimal bandwidth | Float determinism is hard to guarantee. One slow client stalls everyone | Rejected |
| Client-authoritative | Each client computes and reports its own state | Zero perceived latency | Cheating and inconsistency; would be exploited during evaluation | Rejected |

Latency mitigation is kept minimal: **only view-angle rotation is applied immediately client-side** (this has the biggest effect on perceived responsiveness). Movement prediction/rollback is not implemented (unnecessary for sub-60ms LAN/local evaluation).

**Disconnect/reconnect (a requirement of the Remote players module)**: a session token allows reconnection within a grace period. In RSP, a disconnected seat is **immediately taken over by AI**, and control reverts to the human on reconnection (this mutually reinforces the AI opponent module). In FPS 1v1, if one side disconnects, the other wins by forfeit after the grace period.

**WS protocol (conceptual design)**: the following 5 message kinds —
`join / input(seq, keys, yaw) / snapshot(tick, combatants[], score) / event(point_scored, hand_changed, goal, match_end) / spectate`.
No binary encoding initially — starts as JSON, moving to ArrayBuffer only if bandwidth becomes an issue (YAGNI).

> **Implementation status**: this model has been finalized and adopted, and the engine side is complete. What remains is "actually carrying it over WS."
>
> | Element | Status |
> |---|---|
> | Server-authoritative 30Hz sim | `sim.wasm` (`game_step`) runs on Node |
> | Snapshot generation | `game_snapshot` (flat f64 array → serialized to JSON by Node) |
> | Receive-side application + 100ms interpolation | `game_apply_snapshot` + [`web/snapshot_interp.js`](../../web/snapshot_interp.js) (shortest-arc angle interpolation) |
> | Client-immediate view rotation only | Implemented with `yaw` treated as an absolute angle taken directly from the client's reported value |
> | AI takeover of disconnected seats ⇔ handback | Mechanism complete (`game_set_input_source`). When to switch is a room-layer (W-12) operational concern |
> | One-way connectivity check | Established via [`web/sim_demo/`](../../web/sim_demo/) (`record.mjs` records, `replay.html` replays) |
> | **Sending/receiving the 5 WS message kinds** | Game WS done in W-11; lobby presence/queue/LobbyRoom done in the W-08 core. The lobby is still waiting on real Cookie authentication from W-04/W-05. Spec: [2-WSプロトコル設計](./ws-protocol.md) §3–§5 |
> | **Reconnect grace period / forfeit determination** | Not yet started (W-12) — a room-layer responsibility |
>
> Note: in the finalized spec, `input(seq, keys, yaw)`'s `keys` field is `mv` (a 4-bit bitmask) (see design doc 2, §5-A). `hand` was removed in D-17 (the server-side engine determines the hand).

### 2.4 Web stack

All 9 layers have finalized selections. The table below includes an "Integrated" column indicating whether each layer is actually in the repository yet (as of 2026-07-27, 5 of 9 are integrated: React+Vite+TS / Tailwind / Fastify+TS / zod shared schema / WebSocket).

| Layer | Selection | Alternative considered | Rationale | Integrated |
|---|---|---|---|---|
| Frontend | **React + Vite + TypeScript (SPA)** | Next.js / SvelteKit | SSR not required (the SSR module isn't being pursued). SPA is simplest, and React qualifies as a framework per the subject's definition. AI code-generation quality is also top-tier for React | W-01 |
| Styling | **Tailwind CSS** | Bootstrap | Satisfies the "use a CSS framework" requirement. Pairs well with a component-oriented approach | W-01 |
| Backend | **Fastify + TypeScript** | NestJS / Express / Django | With Node, `sim.wasm` can be executed directly (the deciding factor). Fastify has an official WS plugin and is lightweight. NestJS would be overkill for this schedule | W-01 |
| DB | **SQLite + Prisma (ORM)** | PostgreSQL | Evaluation is a single local host (A1). One fewer container; backups = a file copy. Prisma satisfies the ORM Minor requirement, and migrating to Postgres later remains easy | Pending — W-03 |
| Realtime | **WebSocket (@fastify/websocket)** | Socket.IO | Raw WS is sufficient; Socket.IO's abstraction isn't needed here | Integrated in W-11 (originally planned for W-08, but the game WS landed first) |
| Auth | Email + password (argon2id) + **JWT/session via httpOnly cookie** | — | Ensures the required minimum baseline. OAuth/2FA are insurance modules (§5) | Pending — W-04 |
| Input validation | **zod schema shared between FE and BE** | — | Satisfies the "validate on both frontend and backend" requirement with a single schema definition | W-01 |
| Reverse proxy / TLS | **nginx** (HTTPS termination via self-signed cert, static file serving, WS proxy) | Caddy | Track record and available documentation. Internal backend traffic can be plaintext (allowed by the subject) | Pending — W-15 |
| Container | **Docker Compose** (`docker compose up` as a single command) | — | Required. Composition: `nginx` + `app` (Fastify + sim.wasm) + a volume (SQLite/avatars) | Pending — W-15 |

> **Notes on the pending items** (easy to misread):
>
> - The root `docker-compose.yml` already exists but currently contains only the Emscripten build service (`engine-build`). The evaluation requirement of "`docker compose up` brings everything up" will be delivered in W-15.
> - `infra/` similarly is currently just a skeleton with a README (listing what will go there); `nginx.conf` does not exist yet.
> - Prisma is not yet integrated (`schema.prisma` does not exist yet).

---

## 3. System architecture

### 3.1 Overall composition

```
[Chrome]                          [Docker Compose]
┌────────────────────────┐   HTTPS   ┌─────────┐      ┌──────────────────────────┐
│ React SPA               │◄─────────►│  nginx   │─────►│ Fastify (Node/TS)        │
│  ├ Lobby/Profile/Stats  │  REST+static│ TLS term│      │  ├ REST API (auth/users/ │
│  ├ Privacy/ToS          │           │  WS proxy│      │  │   matches/stats)      │
│  └ GameView             │◄─────────►│          │      │  ├ Matchmaking Queue     │
│     ├ render.wasm       │  WSS      └─────────┘      │  ├ WS Gateway            │
│     │ (Canvas rendering)│   input→                    │  └ GameRoom × N          │
│     └ input capture     │   ←snapshot                 │     └ sim.wasm (30Hz tick│
└────────────────────────┘                             │        server-authoritative sim)│
                                                        │  Prisma ─► SQLite (volume)│
                                                        └──────────────────────────┘
```

- **GameRoom**: 1 match = 1 room = 1 `sim.wasm` instance. Multiple rooms run concurrently (this is the basis for the multi-user requirement). On match end, results are persisted via Prisma.
- **Spectating (insurance module)**: read-only WS subscription onto a GameRoom. Designed to add essentially no extra cost.
- **AI seats**: within a GameRoom, the only difference between input sources is whether the supplier is a "WS client" or the "existing RSP AI (built into the sim)."

### 3.2 Repository layout (monorepo)

> **Revision (2026-07-11)**: The original plan of reorganizing cub3D under an `engine/` subtree was **not adopted**. Instead, the existing cub3D layout is kept at the repository root, and Web directories are added alongside it (see [BACKLOG.md](./backlog.md) D-18). This avoids any changes to git history, the Makefile, lint, CI, or Gate 1 deliverables. Option comparison is in that doc's §0.

```
ft_transcendence/
├── docker-compose.yml / .env.example
├── README.md (English, per chapter VI requirements)
├── Makefile           # Existing: native / render.wasm (sim.wasm to be added) — 3 targets
├── codes/             # Existing cub3D: includes / srcs(common・fps・rsp・platform) / PythonCodes
├── maps/  textures/   # Existing assets (.cub and XPM)
├── web/               # HTML/JS for the web target (build/ assets/ are generated, not tracked by git)
├── app/               # TypeScript monorepo (npm workspaces) — new
│   ├── backend/       #   Fastify + Prisma + GameRoom
│   ├── frontend/      #   React + Vite + Tailwind
│   ├── shared/        #   zod schemas, WS protocol type definitions (shared FE/BE)
│   └── tsconfig.base.json
└── infra/             # nginx config, cert generation, monitoring (optional) — new
```

> **Revision (2026-07-27)**: The tree above originally placed `backend/`, `frontend/`, `shared/` directly at the repository root, but the actual implementation consolidated them under `app/` on 2026-07-24 (commit `41aeda2`). The D-18/W-01 rows in doc 5 had already been updated but this tree had been left stale, so it's now brought in line with the implementation. **When writing TypeScript-side paths, always prefix with `app/`** (e.g. `app/shared/src/`).

### 3.3 Database schema (conceptual design)

Addresses the requirement of "a clear schema and clearly defined relations," and the README's Database Schema chapter.

> **Note: the authoritative source for implementation is [3-REST_API設計 §3](./rest-api.md)**. This section is a conceptual design only; column types, constraints, and naming must all follow that document. (The README's ER diagram is also generated from that document, per policy.) The table below was reconciled against that document's §3 on 2026-07-27 (reflecting: **`RefreshToken` removed** — consolidated into `Session` per D-7 there — **`mapName` → `mapId`**, and `endReason` added).

| Table | Key columns | Relations / notes |
|---|---|---|
| `User` | id, email(unique), passwordHash, displayName, avatarPath, createdAt, lastSeenAt | The anchor point for auth, profile, and online-status |
| `Friendship` | id, requesterId, addresseeId, status(pending/accepted) | Between two Users. Used for the Standard user management module's friends + online-status display |
| `Match` | id, mode(`rsp`/`fps`), **mapId**, settingsJson, startedAt, endedAt, winnerTeam? / winnerUserId?, endReason? | One row per match. `settingsJson` records customization (points to win, speed, etc). `mapId` is the whitelisted ID from doc 3 §2-E (same as the `id` returned by `GET /api/maps`). `endReason` is one of `score`/`goal`/`forfeit`/`abandon` (same value space as design doc 2 §5-D) |
| `MatchPlayer` | id, matchId, userId?(null = AI), isAi, team, slot, pointsScored, result(win/lose/draw/abandon) | Join table between Match and User. **AI seats are also recorded as rows** (for statistics consistency) |
| `Session` | id, userId, tokenHash, expiresAt | Keeps a user logged in. **Opaque token + httpOnly cookie** (doc 3, D-4). The raw token is never stored — only its SHA-256 hash. **No separate `RefreshToken`** (consolidated into `Session` per doc 3 D-7; a sliding expiration is sufficient) |
| (insurance) `OAuthAccount` | provider, providerUserId, userId | Only if the OAuth Minor module is adopted |

Statistics (win rate, match history, leaderboard) are derived via aggregate queries over `Match`/`MatchPlayer` rather than adding new tables (avoiding dual bookkeeping).

---

## 4. Module selection and points calculation

> **Priority policy (team-decided)**: the only mandatory target is the **core 14pt**. The 3 bonus items (#9–11) are positioned as points on top, but also as a **fallback** in case any core module is scored 0pt during evaluation. The §4.3 insurance modules are only attempted "if time remains" — no work allocation may threaten completion of the core.

### 4.1 Core 14pt (mandatory target line)

| # | Module | Category | pt | How this design achieves it |
|---|---|---|---|---|
| 1 | Complete web-based game implementation | Gaming Major | 2 | RSP mode (real-time multiplayer, well-defined rules, 3D) |
| 2 | Remote players | Gaming Major | 2 | Server-authoritative sim + WS; explicitly demonstrates latency interpolation and disconnect/reconnect (AI takeover → handback) |
| 3 | Multiplayer (3+ players) | Gaming Major | 2 | RSP 2v2 = 4 players in the same match |
| 4 | Frameworks on both FE and BE | Web Major | 2 | React (FE) + Fastify (BE) |
| 5 | Real-time functionality via WebSockets | Web Major | 2 | Beyond game sync: lobby online-presence and live match-result updates (connect/disconnect handling, broadcasting) |
| 6 | Standard user management and auth | UserMgmt Major | 2 | Profile updates, avatar upload, friends + online status, profile page |
| 7 | Use of an ORM | Web Minor | 1 | Prisma + SQLite |
| 8 | Game stats and match history | UserMgmt Minor | 1 | Aggregation over Match/MatchPlayer (win rate, history, per-mode record) |
| | **Subtotal** | | **14** | |

### 4.2 Bonus +5pt (positioned as points that also serve as a fallback for the core)

| # | Module | Category | pt | How this design achieves it |
|---|---|---|---|---|
| 9 | AI opponent | AI Major | 2 | Porting the existing RSP rock-paper-scissors AI and the FPS chase AI. Fills empty/disconnected seats and serves as a single-player opponent. Pitched as human-like behavior — "chase a winning hand, flee a losing hand." Supports difficulty tuning (speed/reaction coefficient) |
| 10 | Another game (with history + matchmaking) | Gaming Major | 2 | FPS race mode, built on the matchmaking queue and history infrastructure shared with the first game |
| 11 | Game customization options | Gaming Minor | 1 | Map selection (.cub assets) + points-to-win, movement/enemy speed (UI over existing parameters like MS/ES) |
| | **Subtotal** | | **+5** | |

**Declared total: 19pt = core 14 + bonus cap of 5.**

### 4.3 Insurance modules (attempted only "if time remains")

Attempted, in priority order, only if the core and bonus are entirely secure. Only working features get declared in the README. All were chosen for their low marginal cost given this architecture.

| Priority | Module | pt | Why the marginal cost is low |
|---|---|---|---|
| 1 | Spectator mode | Minor 1 | Just a read-only WS subscription to GameRoom + a viewpoint-switch UI (already designed in §3.1) |
| 2 | OAuth 2.0 remote auth (Google) | Minor 1 | Fastify has a mature plugin for this; just adds an `OAuthAccount` on `User` |
| 3 | Full 2FA system | Minor 1 | TOTP library + QR display; one extra screen in the auth flow |
| 4 | Prometheus + Grafana monitoring | Major 2 | Two extra containers in compose + a Fastify metrics endpoint. Independent of the game core, so it can be started late |

### 4.4 Dependency / consistency check

- Game-dependent required modules (AI opponent / Multiplayer 3+ / Another game / Customization / Spectator / Game stats) → all satisfied because **#1 RSP is the first game**.
- Another game's "requires a first game" dependency → RSP comes first, FPS second (schedule follows this order too).
- SSR is not chosen (the ICP-incompatibility caveat also becomes moot). Advanced chat is not chosen (since the prerequisite User interaction Major module wasn't selected).
- "C→WASM engine porting" will not be declared as a Modules of choice (custom Major) — it is the means by which the game modules are realized, and declaring it separately risks being flagged as double-counting. If there's room during evaluation, it will be mentioned verbally only.

---

## 5. Mandatory requirements coverage (closing off disqualification risks)

| Mandatory requirement (Chapter III) | How this design covers it | Owner |
|---|---|---|
| Web app with FE + BE + DB | React / Fastify / SQLite(Prisma) | Everyone |
| Commits from everyone with clear messages | Conventional Commits + required PRs + 1 reviewer | Audited by PM |
| Single-command container startup | `docker compose up` (bundles cert generation, migrations, asset conversion on first run) | Backend/DevOps |
| Latest stable Chrome compatibility | Chrome fixed as the sole target, checked daily | Everyone |
| **No console warnings or errors** | WASM build flags and React strict-mode warnings checked in CI. A dedicated hardening day scheduled for the final stretch (originally Day 12) | Frontend + Engine |
| Privacy policy / terms of service pages | Persistent SPA footer links. Content matches real data flows (account info, match history, avatars, cookies). **No placeholder content allowed** | Frontend |
| Multi-user concurrent usage | Multiple concurrent GameRooms + lobby online status. **Measured with "2 rooms, each 2 humans + 2 AI = 4 windows total"** (see design doc 2 §10-5; revised down from the original "8 simultaneous browsers") | Backend |
| Responsive, accessible FE | Tailwind breakpoints. Since the game itself requires a keyboard, the lobby/stats/profile screens get the primary responsive focus | Frontend |
| env excluded from Git + env.example | `.gitignore` and `env.example` in place from day one | Backend/DevOps |
| Clear schema and relations | §3.3 + an ER diagram in the README | Backend |
| Email + password auth (hash + salt) | argon2id (salt built in) | Backend |
| Input validation on both FE and BE | Shared zod schemas (§2.4) | Frontend + Backend |
| All external connections over HTTPS | nginx TLS termination (both REST and WS use https/wss); internal traffic may be plaintext | Backend/DevOps |

---

## 6. Team role allocation (4 members)

> **Note: actual operations changed twice.** First on 2026-07-23: this section records the original plan (4 lanes = 4 people). In practice, samatsum completed the Engine (E-01–E-14) and Gameplay (G-01–G-10) lanes single-handedly, so **the remaining Backend and Frontend lanes were reassigned across the 4 people**. Then, more fundamentally, on 2026-08-05: the team dissolved, and **samatsum is now the sole active contributor across every lane** (torinoue / mamiyaza / hminemur are no longer active). The table below is kept as a historical record of who built what; it is not a current assignment. The authoritative current team status is [`../ja/チーム体制.html`](../ja/チーム体制.html).
>
> The subject's mandatory roles (PO / PM / Tech Lead / Developer) are still assigned as described below.

The subject's mandatory roles (PO / PM / Tech Lead / Developer) are assigned across 4 people, with everyone also acting as a developer. The lane labels below are **First / Second / Third / Fourth** (real-name assignment was to be finalized at kickoff).

> **Note: mapping from lane label to current names.**
>
> The four lane labels do not map 1:1 to the current 4 people. The Backend/DevOps and Frontend lanes were each split across 2 people, and the Gameplay lane's implementer and the PM role are now different people. References to these labels in design docs ①–⑥ (or in older parts of this document) should be read against the table below. **Documents from this point on use names, not labels.**
>
> | Lane label | Lane name | Who implemented / implements it | Notes |
> |---|---|---|---|
> | First | **Engine** | **samatsum** (E-01–E-14 complete) | Also retains the Tech Lead role |
> | Second | **Backend/DevOps** | **torinoue** (Auth/REST/DB/DevOps) + **samatsum** (WS/GameRoom/sim.wasm) | Split between 2 people — the label alone doesn't identify who |
> | Third | **Frontend** | **mamiyaza** (non-game screens) + **hminemur** (GameView/HUD) | Split between 2 people — the label alone doesn't identify who |
> | Fourth | **Gameplay** | **samatsum** (G-01–G-10 complete) | Only the PM/scrum-master role moved to torinoue |
>
> [6-チーム分担計画 §3](../ja/チーム体制.html) is the sole authoritative source for current ownership.

| Member | Subject role | Development area | Primary modules |
|---|---|---|---|
| **First** | Tech Lead / Architect | **Engine**: MLX decoupling, platform layer, 2-target Emscripten build, asset pipeline, render performance | #1 Web-based game (rendering side), #9 AI (porting) |
| **Second** | Developer (infra owner) | **Backend/DevOps**: Fastify, auth, Prisma/schema, GameRoom/WS, Docker/nginx/TLS, CI | #2 Remote, #5 WS, #7 ORM, insurance-4 monitoring |
| **Third** | PO and developer | **Frontend**: all SPA screens (lobby, matchmaking, game-canvas integration, profile, stats, Privacy/ToS), responsiveness | #4 Frameworks, #6 User mgmt (UI), #8 Stats (UI), insurance-1 spectator UI |
| **Fourth** | PM/scrum master and developer | **Gameplay**: RSP first-to-10 rule, FPS goal/race conversion, customization, matchmaking spec, QA/integration testing, README | #3 Multiplayer, #10 Another game, #11 Customization |

- **Project-management tooling/communication (team-decided)**: task management, PRs, and reviews go through **GitHub** (Issues / Projects / Pull Requests); day-to-day communication and daily sync happen on **Discord** (documented as such in the README's Project Management chapter).
- Areas that will definitely be examined at evaluation (auth, scoring) follow a **primary-owner + reviewer** two-person model with samatsum as primary, backed by twice-weekly cross-demos so everyone can explain the requirement (per section II.1.2's note that everyone must be able to explain their work).
- AI usage policy: boilerplate code (CRUD, UI, zod, Prisma, Emscripten build config) defaults to AI generation; **design decisions for the sim/protocol/schema require human review**. AI usage is logged in PRs and transcribed into the README's Resources section.

---

## 7. Schedule (with gates)

> **Note: this schedule is stale.** The 14-day table below reflects the original 2-week plan. The project's actual duration is now 5 days, and this table is no longer an accurate schedule — it is retained purely for historical reference. See [6-チーム分担計画 §5.1「5日間の日割り」](../ja/チーム体制.html) for the schedule that is currently in effect.
>
> **Progress (2026-08-07)**: of the original plan's 4 parallel lanes, the **entire Engine and Gameplay schedules are complete** (E-01–E-14 / G-01–G-10; Gate 1 passed). Backend/DevOps has completed W-01/W-08 core/W-09/W-10/W-11/W-12/W-14; Frontend has F-01/F-02/F-06 done and F-07 implemented but unmerged ([PR #35](https://github.com/samatsum/ft_Transcendence/pull/35)). **Gate 2 is not yet met** — what remains server-side is wiring W-04/W-05 into W-08, and frontend-side is F-05 (lobby, not started), merging F-07, and F-08 (not started).

(The following is the original 2-week plan.) 4 parallel lanes. **Bold marks a gate** (if not cleared, the fallback for that gate triggers).

| Day | First: Engine | Second: Backend/DevOps | Third: Frontend | Fourth: Gameplay/PM |
|---|---|---|---|---|
| 1 | Inventory MLX call sites, define platform-layer interface | Monorepo, Docker skeleton, CI, env setup | Vite+React+Tailwind scaffold, screen-flow design | Finalize rule spec (RSP scoring / FPS goal), backlog it |
| 2 | **Gate 1: Emscripten spike** (static map renders to Canvas) | Fastify boot, Prisma schema v1, auth design | Auth screens, footer/Privacy/ToS skeleton | .cub map design (2 for RSP, 2 for FPS) |
| 3 | Wire up input and time (walkable in first person) | Signup/login complete (argon2 + cookie) | Lobby screen, start API integration | `game_step` split spec review, QA environment |
| 4–5 | Headless `sim.wasm`, support multi-player input arrays | GameRoom, WS gateway, snapshot distribution | GameView (Canvas+WASM integration, input send) | Implement RSP team score / first-to-10 / respawn in the sim |
| 6–7 | Interpolation, immediate view rotation, render optimization | Reconnect token, AI-seat swap-in mechanism | Score HUD, match-end screen | **Gate 2: 2 browsers can play a full 2v2 RSP match** (Day 7 mid-project review) |
| 8–9 | FPS-mode render differences (goal effects, etc.) | Matchmaking queue (shared across both games), match persistence | Matchmaking UI, match-history/stats pages | FPS race conversion (goal detection, 1v1, forfeit), #9 AI difficulty tuning |
| 10 | Performance hardening (internal resolution tuning) | Friends/online-status API | Profile/avatar/friends UI | #11 Customization (map, points-to-win, speed) implementation |
| 11 | (only if time remains) insurance-1 spectator viewpoint switching | (only if time remains) insurance-2 OAuth / insurance-4 monitoring | (only if time remains) spectator UI / design polish | **Gate 3: core 14pt fully working end-to-end** (only completed bonuses get declared) |
| 12 | **Hardening day (everyone)**: zero console warnings, 2 responsive sizes, 8 simultaneous browsers, HTTPS end to end (mkcert CA install), SQLi/XSS attack battery, full-history secret scan of the repo, measure empty-folder `git clone` → single-command startup (per §9.1) | | | |
| 13 | Code freeze. README (English, full chapter VI structure), ER diagram, AI usage log, demo script, evaluation rehearsal | | | |
| 14 | Buffer (fixes from rehearsal only), submission | | | |

**Fallbacks**: If Gate 1 fails → fall back to Option B (TS raycaster, using the C implementation as a spec; First and Fourth join the port). If Gate 2 fails → swap out FPS mode (#10) for insurance modules (insurance-1 + insurance-2, etc.) to still secure 14+α. If Gate 3 fails → drop non-working modules from the declaration (never declare a 0pt module).

---

## 8. Risks and mitigations

| Risk | Impact | Detection signal | Mitigation |
|---|---|---|---|
| ~~Emscripten porting proves unexpectedly difficult~~ **Resolved** | Whole project | Day 2 Gate 1 | Spike first, fallback to Option B, keep the MLX replacement layer to a minimal interface (buffer/input/time only) → **Gate 1 passed with a go decision; 3 targets are running. Fallback Option B is no longer needed** |
| ~~pthread parallel renderer doesn't work in WASM~~ **Resolved** | Render performance | Day 2–3 | Single-threaded, low internal resolution from the start. Avoid COOP/COEP → **measured 112fps single-threaded at 960×540 on web (E-13). About 1.8× headroom over the 60fps requirement; internal resolution can also be scaled down via an argument if ever needed** |
| Browser/server state inconsistency | Match quality | Day 6–7 | Client is display-only (does not simulate), which structurally prevents inconsistency by design → **Engine side is already guaranteed (client has no win/loss-determination code). W-11/F-06 integration is now done (F-06 merged); re-verify once F-05 lets a real lobby drive it end-to-end** |
| "Zero console errors" requirement not met | **Project disqualification** | Continuous CI | Suppress WASM build warnings via flags established on day one. Dedicated Day 12 hardening day |
| Privacy/ToS judged too thin | **Project disqualification** | Day 12 review | Start on content matching real data flows early (not a copy-pasted template) once frontend work resumes — F-04 is currently unassigned/未完成 |
| Team's inexperience with Web tech | Velocity | Daily | Standardize on AI pair-programming + fix each person's area (narrow the learning surface) + primary-owner/reviewer pairs |
| A module judged incomplete at evaluation | Points | Gate 3 | Declare 19pt + 4 insurance items + the principle of "never declare something that doesn't work" |
| Minor fix requests during evaluation (Chapter VIII) | Evaluation | — | Cross-training rehearsal on Day 13 so everyone can explain areas outside their own. Tunables centralized in `tuning.h` / settingsJson to make fixes easy |

---

## 9. README and evaluation-criteria mapping

> **Note: this section's *content* (the demo script and checklist itself) remains current, but its *name assignments* do not.**
> §9.1 was written on 2026-07-27 for the then-4-person team; as of 2026-08-05 that team has dissolved and
> **samatsum is the sole active contributor**, filling every role below. Read every `torinoue` / `mamiyaza` / `hminemur`
> cell in §9 and §9.1 as "unassigned — samatsum covers it solo until a role is reassigned," not as a live task
> handout. See [`../ja/チーム体制.html`](../ja/チーム体制.html) for the authoritative current team status.

Ownership and source material for Chapter VI's required README sections. The README is written in English and finalized on **Day 5**.

| README section | Source | Owner |
|---|---|---|
| Opening declaration / Description | §1 of this document | torinoue |
| Instructions | docker compose steps + env.example | torinoue |
| Team Information / Project Management | §6/§7 of this document + actuals (GitHub Issues/Projects, Discord workflow) | torinoue |
| Technical Stack (rationale) | §2 of this document (summarize the trade-off tables) | samatsum |
| Database Schema | §3.3 of this document + ER diagram | torinoue |
| Features List / Modules (justification, ownership, point calculation) | §4 of this document | torinoue |
| Individual Contributions | Each person's own writeup + PR history | Everyone |
| Resources + **AI usage explanation** | Aggregated from AI-usage notes kept in PRs (which task, which part) | Everyone → edited by torinoue |

### 9.1 Evaluation-day checklist (demo script mapped to the evaluation sheet)

Mapped 1:1 to the inspection steps on the evaluation sheet (42evalhub / ft_transcendence). The **Day 5** rehearsal runs through this exact script.

| Evaluation-sheet check | Response on the day | Prep (owner) |
|---|---|---|
| Everyone present; each explains their role and "at least one feature they personally implemented" | Everyone prepares a memorized 60-second speech on their role + one feature | Everyone (peer-reviewed at the Day 5 rehearsal) |
| **2 or more** people can explain the whole project (concept, tech, team operations) | **samatsum (Tech Lead)** as primary, **torinoue (PM)** as secondary explainer; mamiyaza and hminemur available as backups | samatsum, torinoue |
| FE/BE/DB each explained by a **different member** | **FE = mamiyaza, BE = samatsum, DB = torinoue**, pre-assigned (backup: FE = hminemur). BE is split between samatsum (WS/GameRoom) and torinoue (REST/Auth) in practice, but samatsum is the designated explainer for evaluation purposes | mamiyaza, samatsum, torinoue |
| Empty-folder `git clone` → single-command startup | Measure a clean-machine-equivalent (no cache) `git clone` → `docker compose up` on **Day 5**, including first-build time so it can be communicated | torinoue |
| Malicious-alias / repository-ownership check | Canonical repo URL stated at the top of the README; demo runs from a default shell | torinoue |
| Git history (commits from everyone, clear messages) | Prepared to show `git shortlog -sn` and Conventional Commits usage; audited daily for any single-person skew | torinoue |
| No errors/warnings in the DevTools console | Run through every screen transition plus one full match with the console open, on **Day 5**. If any third-party warning remains, document the cause so it can be explained (per the evaluation sheet, explainable minor warnings are tolerated) | mamiyaza (all screens), hminemur (match screen) |
| Privacy/ToS reachable from the footer, real content | Content matches real data flows (account, match history, avatar, cookies). No placeholders | mamiyaza |
| Responsive (checked at a **minimum of 2 screen sizes**) | Verify every screen at desktop and mobile widths. Be ready to explain that the game screen itself is spectate/view-focused on mobile | mamiyaza |
| CSS framework usage shown in code | Have a representative file ready to open instantly showing Tailwind usage | mamiyaza |
| Zero secrets in env / .gitignore / repository | **Full-history secret scan of the repo on Day 5** (a leaked secret in past commits is near-automatic disqualification) | torinoue |
| DB schema explanation | Walk through the README's ER diagram + the Prisma schema | torinoue |
| Password hash+salt explanation | Be ready to explain the choice of argon2id (memory-hard, salt built in) in 30 seconds | torinoue |
| Form validation checked via **live SQLi/XSS/invalid-input testing** | Run an attack battery on **Day 5**: empty input, type mismatches, SQLi strings, XSS payloads (against chat-equivalent fields, display name, avatar filename). Explain the defense-in-depth of zod + Prisma (prepared-statement equivalent) + React's auto-escaping | torinoue, mamiyaza |
| HTTPS confirmed **via the browser address bar** | Pre-install mkcert's local CA on **every machine that will connect**, showing a warning-free lock icon (avoids the self-signed warning derailing the demo). **Caution: if demoing a connection from a separate PC, forgetting to install the CA on that machine will fail this whole check** | torinoue |
| Modules demoed **individually**, one at a time, with dependencies confirmed | A rehearsed script for each of §4's #1–#11: how to show it, under 2 minutes each, assigned presenter. State the dependency (RSP is the first game) verbally up front | torinoue writes the script; presenters per §4 |
| Everyone can explain each other's area (teamwork check) | Cross-training exercise at the Day 5 rehearsal — each person explains one area that isn't their own | Everyone |
| Multi-user concurrency / multiplayer 3+ | **Two 4-window demos** prepared (see design doc 2 §10-5; revised down from the original "8 windows"). **Demo A**: 1 room, 4 humans, 0 AI seats (demonstrates core #3's 2pt with humans only). **Demo B**: 2 rooms, each "2 humans + 2 AI" = 4 windows total (demonstrates no conflicts, per III.2). **If possible, connecting from 4 separate physical machines** would simultaneously demonstrate core #2's "across separate PCs" requirement | samatsum (owns the W-11 distribution side) |
| Bonuses only demoed if the core is fully working; capped at 5pt | Script always runs "core 14pt demo → complete → then bonus." If a core issue surfaces, bonus demos are cancelled in favor of fixing the core | torinoue makes the go/no-go call |

---

## 10. Decision summary

| Topic | Decision |
|---|---|
| Engine strategy | **C → Emscripten/WASM, 2 targets** (server-authoritative `sim.wasm` + client-rendering `render.wasm`). Day 2 go/no-go; fallback is a TS rewrite |
| Networking | **Server-authoritative + JSON snapshots** (30Hz sim / 15–20Hz distribution / 100ms interpolation). Only view rotation is predicted client-side. Disconnected seats are taken over by AI |
| Stack | React+Vite+Tailwind / Fastify+TS / Prisma+SQLite / nginx TLS / Docker Compose |
| Main game | RSP 2v2, first to 10 points (a rock-paper-scissors win = +1 point). Human/AI input is swapped into the existing 4-combatant structure |
| Second game | FPS 1v1 race (collect → door → first to goal). Enemies act as hazards |
| Modules | **Mandatory target is core 14pt**. The 3 bonus items (+5pt) count as points and also serve as a fallback for the core. The 4 insurance items (spectator/OAuth/2FA/monitoring) are attempted only if time remains. No custom Major is declared |
| Team structure (as planned; superseded 2026-08-05) | **samatsum** = Tech Lead / Engine + Gameplay (complete) + game server, **torinoue** = PM / Backend foundation, **mamiyaza** = PO / Frontend foundation, **hminemur** = Developer / Frontend game screens. Critical areas use a two-person model. Task management via GitHub, communication via Discord. **The team has since dissolved; samatsum is now the sole active contributor covering every role** (current authoritative source: [チーム体制.html](../ja/チーム体制.html)) |
| Quality gates | Day 2 (WASM rendering) / Day 7 (full 2v2 RSP playthrough) / Day 11 (all 19pt working) / Day 12 (disqualification-risk hardening) — **these numbers are from the original 14-day plan. For the current 5-day mapping, see [doc 6 §5.1](../ja/チーム体制.html) (Gate 2 = Day 3 / Gate 3 = Day 4 / hardening = Day 5)** |
