# FRONTEND_DESIGN — SPA Screens / HUD Detailed Design (④)

> Source: translated from the Japanese original at md_files/02_設計書/4-フロントエンド設計.md (archived).

**Positioning**: This document translates the API contracts from [ARCHITECTURE_DESIGN.md](./architecture.md) §2.4/§3.1, [WS_PROTOCOL_DESIGN.md](./ws-protocol.md) (②) §3/§5/§7-B, and [REST_API_DESIGN.md](./rest-api.md) (③) into screen specifications. It corresponds to the Frontend lane's work instructions, structurally split into non-game screens and GameView/HUD — originally planned across mamiyaza (non-game) and hminemur (GameView/HUD) under the 4-person team that dissolved 2026-08-05. **F-01, F-02, GV-06, and GV-07 were done during the single-contributor period** (implemented solo by samatsum; GV-07 merged via [PR #35](https://github.com/samatsum/ft_Transcendence/pull/35)); see [backlog.md](./backlog.md) §5 for per-issue status. F-03, F-04, GV-08・F-11・GV-12 were **未完成 (not started)** as of the single-contributor period; **team operation started 2026-08-30 with a new roster** (see [`../human/はじめに/チーム体制.html`](../human/はじめに/チーム体制.html)), so check `backlog.md` for whether that status has since moved — this document does not track it live. **F-09 and F-10 are no longer declared** as of 2026-08-08 (D-19) — their screen specs below are retained as the recovery plan, not as work orders — while **GV-12 was promoted from reserve to required**.
**Principle**: This document contains no implementation code (only screen composition, state, data sources, and acceptance criteria).

---

## 0. Premises and decisions finalized this round

| # | Topic | Decision | Rationale |
|---|---|---|---|
| D-11 | HUD rendering split | **The C renderer (render.wasm) draws only the 3D world + the player's own hand (`render_rsp_hand`). Score, countdown, opponent status, and results are React DOM overlays.** | Uses the existing C assets unmodified, and pushes style tuning and zero-console verification to the DOM side. The C-built-in UI (minimap etc., `FLAG_UI`) defaults to OFF on the web (kept toggleable via the E-08 key bindings) |
| D-12 | State management | **No React Query or similar library.** A `fetch` wrapper + Context + zod (shared with the backend). WS uses custom hooks `useLobbySocket` / `useGameSocket` | Minimizes dependencies and learning cost (A2). There isn't enough data volume to warrant caching |
| D-13 | Mobile support boundary | Lobby, Profile, Auth, and Privacy/ToS are **fully responsive**. GameView on mobile widths shows a "keyboard required" notice + view-only mode | Game controls assume a keyboard (USER_DOC §2). Evaluation shows lobby-family screens at "at least 2 screen sizes" (§9.1) |
| D-14 | RSP hand input UI | **Not built.** The hand is determined authoritatively by the server (changes on respawn or entering one's own territory), so the client never sends `input.hand` | The current game rules (USER_DOC §5) have no concept of player choice here. The `hand` field in ② §5-A was removed in ⑤ D-17 |
| D-15 | Theme | Fixed single dark theme. CSS variables + Tailwind | Theme switching has low effort-to-value ratio |

---

## 1. Routes and guards

An SPA built with React Router. Unauthenticated access to a protected route redirects to `/login` (determined at startup via `GET /api/auth/me`).

| path | Screen | Guard |
|---|---|---|
| `/` | → redirects to `/lobby` | Auth required |
| `/login` / `/signup` | Auth | Redirects to `/lobby` if already authenticated |
| `/lobby` | Lobby (§3.2) | Auth required |
| `/game/:roomId` | Game (§3.3) | Auth required |
| `/profile/:id` | Profile (§3.4) | Auth required |
| `/privacy` / `/terms` | Privacy Policy / ToS (§3.5) | **Not required** (readable while logged out) |
| `*` | 404 | — |

## 2. Common layout

- **Header**: Logo (→ `/lobby`), the user's own avatar + name (→ `/profile/:me`), logout.
- **Footer**: **Links to Privacy Policy / Terms of Service are always present on every screen** (satisfies the rejection criterion "reachable from the footer". Also shown outside the match_end modal on the game screen).
- **Toast**: Common display area for errors/notifications (shows the `msg` field from the error envelope in ③ §1-A; the `code` field is never emitted to the developer console — zero-console operation).
- **ErrorBoundary**: Shows a reload path on render exceptions (prevents blank screens and unhandled console exceptions).
- Breakpoints: Tailwind defaults (evaluated at two points: mobile < 768px / desktop ≥ 1024px).

## 3. Screen specifications

### 3.1 Login / Signup

- Fields and validation use the zod schemas from ③ §1-B **as-is** (this is the demo point for dual FE/BE validation). Errors are shown directly below each field.
- Double-submission is prevented while submitting. 401/409 responses are mapped to field errors (e.g. `email_taken` → the email field).
- On success → `/lobby`. The lobby WS connects here (§4).

### 3.2 Lobby (the central screen of this project)

> **Two of the five areas below are no longer in F-05's scope (2026-08-08, D-19).** **Friends** reads
> `GET /api/friends` and `presence_update`, both owned by B-07; **Match feed** prepends on
> `match_result`, which ②§7-B only emits after B-13 persists the match. Both B-07 and B-13 are not
> declared, so those two areas have no data source. **F-05 delivers Quick Match, Custom Room and Room
> view.** The two rows are kept below as the specification a restore would start from —
> see [backlog.md §5](./backlog.md).

Data sources: REST (initial render) + Lobby WS (deltas). Maps 1:1 to the messages in ② §3.

| Area | Composition | Data / actions |
|---|---|---|
| Quick Match | Two buttons for RSP / FPS; after joining, a queue-status panel (number waiting, own position, **seconds remaining until auto-start**). The leader sees a "**Fill with AI and start now**" button | `queue_join` / `queue_leave` / `queue_fill_start`. Displayed via `queue_state` (`auto_fill_in_ms`, `is_leader`) |
| Custom Room | "Create room" → rules form (both modes: map selection = `GET /api/maps`; RSP only: winning score 3–21. Only the **2 items that actually affect the current engine** per ② §4-B are exposed in the UI) / "Join with code" input (6 characters, lowercase allowed) | `room_create` / `room_join`. Navigates to the room view |
| Room view | Seat cards × capacity (avatar/name/`is_ai` badge/host crown), rules display (editable by host only), start button (host only), room code copy | Renders the full retransmitted `room_state` as-is (no delta management). `room_update_rules` / `room_start` / `room_leave` |
| Friends | Friends list + presence badge (online/in_queue/in_game/offline), send/accept/reject requests | Initial = `GET /api/friends`, deltas = `presence_update`. Request actions go through REST (③ §2-C) followed by a list refetch |
| Match feed | A live-updating list of all match results across the platform (winning team, player names, mode) | New items are prepended on `match_result` (**this is the demo point for the "real-time updates reflected to all connected users" requirement**; shown side by side in the evaluation script) |

- On receiving `match_found` → show a toast + **automatically navigate to `/game/:roomId`** (② §4-C. There is no accept dialog). On lobby WS reconnect, the resend also returns the user to the same room.
- While in a queue, belonging to a LobbyRoom, or preparing/playing a match, conflicting lobby actions are disabled in the UI (this also expresses in the UI the "one user, one context" principle from ② §3-E).

### 3.3 GameView (`/game/:roomId`)

Layer structure (bottom to top):

```text
[Canvas 960x540 internal resolution, CSS letterbox-scaled]   ← rendered by render.wasm (world + own hand)
[HUD overlay (DOM, pointer-events: none)]                    ← score, status, effects
[Modal layer (countdown / match_end / disconnect banner)]    ← has interaction
[Header/Footer hidden; Footer links collapse into the match_end modal]
```

| HUD element | Content | Data source |
|---|---|---|
| Score bar (top center) | RSP: `[Red 7 - 4 Blue]` with team colors. FPS: score hidden (it's a race, so only progress is shown = collected count `x/y`) | `snapshot.match.score` / `world_delta` |
| Opponent status row (top corner) | Per seat: name + status badge `connected / disconnected(n sec left) / AI` | `player_status` + `event(player_disconnected).grace_ms` (per the requirement in ② §7-B) |
| Own hand | **Not shown in the HUD** (drawn at the bottom of the screen by the C renderer's `render_rsp_hand`). On `hand_changed` (own) only a flash at the Canvas edge occurs | `event(hand_changed)` |
| Scoring effect | On `point_scored`, flash the screen edge in the scoring team's color + emphasize the score bar | `event(point_scored)` (the authoritative value comes from the snapshot side — this event is used for the effect only. ② §5-D) |
| Countdown | Full-screen `3・2・1` overlay → disappears on `match_start` | `event(countdown / match_start)` |
| match_end modal | Win/loss, final score, "Return to lobby" button. If `match_id` is a positive integer, per-player results are also shown from REST. If null, notifies that saving failed and shows results from the final snapshot only | `event(match_end).d.match_id` → `GET /api/matches/:id` (only when non-null) |
| Own connection banner | On own WS disconnect, a "Reconnecting…" banner + automatic reconnect. On recovery, a "Reconnected" toast is shown when `welcome.resume=true` | `useGameSocket` state machine (§4) |
| Spectator HUD (**GV-12, required as of 2026-08-08**) | When `role=spectator`, adds a viewpoint switch button (seats 1–4). Needs **B-17** (the server side of `spectate`) first | `welcome.role`. Switching only changes the viewpoint target on the client side (② §5-E) |

**Input capture** (the contract that connects to the E-08 JS side):

- Clicking the Canvas starts capture; `Esc` releases it (movement input is not sent while released).
- While capturing, default browser behavior for arrow keys etc. (scrolling) is prevented via `preventDefault`.
- keydown/keyup → logical axes → sends `input { seq, yaw, mv }` at 30Hz (② §5-A. `hand` is never sent = D-14, `act` is fixed at 0).
- Rotation (←→) is integrated into yaw locally and reflected immediately (the only prediction in ②). All keys are released on tab hidden (`visibilitychange`) (prevents stuck-key accidents).

### 3.4 Profile (`/profile/:id`)

| Area | Content | Data source |
|---|---|---|
| Header card | Avatar, name, registration date, last login, presence badge | `GET /api/users/:id` |
| Stats card | Per-mode played / win / lose / abandon / **win_rate** (value follows the derivation rules in ③ §2-D) | `GET /api/users/:id/stats` |
| Match history | Table (date/time, mode, map, result, score, opponent). Mode filter + pagination. Clicking a row opens a match-detail modal | `GET /api/matches?user_id=` / `GET /api/matches/:id` |
| Own profile only | Name change, password change forms, avatar upload (preview, immediate 2MB/format error display) | `PATCH /api/users/me` / `PUT /api/users/me/avatar` |
| Others' profiles only | Friend request/remove button | ③ §2-C |

### 3.5 Privacy Policy / Terms of Service

**Placeholder text is prohibited** (a rejection criterion). Prepare real wording that matches the actual data flows. Must include at minimum the following sections:

- **Privacy**: Data collected (email, password hash, display name, session cookie — **not** avatar images or match history; B-06 and B-13 are not declared, so neither is ever stored) / purpose of use (authentication, matchmaking) / cookie explanation (session persistence only, no tracking) / storage location and retention period (self-hosted SQLite, for the lifetime of the account) / no third-party sharing / **the fact that there is no account deletion feature**, plus a contact point for deletion requests (the operator listed in the README).
- **Terms**: Service description (competitive game) / prohibited actions (unauthorized access, cheating, offensive display names) / no warranty / a statement that this is a 42 educational project.

## 4. WS hook state machines (client responsibilities)

Translates the connection rules in ② into implementation contracts on the UI side.

- **`useLobbySocket`**: Connects after login, disconnects on logout/401.
  On disconnect, auto-reconnects with exponential backoff of 1s→2s→5s (capped), and shows an "Offline" badge in the header.
  On receiving close code `4004` (replaced by a duplicate connection), it does **not reconnect** and instead shows an "Opened in another tab" screen (can be reclaimed by reloading).
  The URL is built by converting `location.protocol` (`http:`→`ws:`, `https:`→`wss:`) and concatenating `//${location.host}/ws/lobby`, without embedding the backend port.
  In development this goes through Vite's `/ws` WebSocket proxy; in production it goes through nginx.
  Since the server retains the LobbyRoom for 10 seconds and resends `room_state` after reconnect, the client does not automatically resend `room_join`. Being queued is cleared on disconnect, so the client does not automatically rejoin the queue.
- **`useGameSocket`**: Connects and sends `join` on mount of `/game/:roomId`; closes with code 1000 on unmount.
  On disconnect, if still in-game, auto-reconnects + sends `join` (fits within the 30-second grace period from ② §7).
  On close code `4002` (room gone) → shows a toast + navigates to `/lobby`.
- Incoming messages are validated with zod; **validation failures do not emit a console error** and instead go to a dev-log function (a no-op in production) (zero-console operation).
- Interpolation follows the contract in ② §5-C (100ms delay, linear interpolation between 2 snapshots, own yaw takes local priority).
  Implementation is shared with the E-08 receiving-end JS (division of responsibility: **Engine = wasm calls and interpolation computation; hooks/lifecycle/HUD reflection = GV-06/GV-07 — both implemented by samatsum, both done and merged**).

## 5. Common components (minimal set)

`Button / Input / FormField / Card / Modal / Toast / Badge (presence, team colors) / Avatar / Table / Tabs / StatCard / SeatCard / CopyField (room code)`.
The custom design-system module **is** declared, as bonus #10 (architecture.md §4.2), and is now **complete**: component count, palette, typography and icon set are all done, catalogued in `components/design-system.ts` and the dev-only `/dev/design-system` gallery page — see §4.2 for detail.

## 6. Acceptance criteria

1. Walking through all screen transitions plus one full match with DevTools console open the whole time produces **zero errors / warnings** (with React StrictMode enabled).
2. All screens render without breaking at both desktop width and mobile width (375px). GameView shows the notice at mobile width.
3. Direct-linking to `/lobby` while logged out → redirects to `/login`. After login, returns to the original URL.
4. `/privacy` and `/terms` are reachable within 2 clicks from the footer, and show the real wording.
5. ~~With the lobby open in two browsers, one browser's match ending appears in the other browser's match feed within a few seconds (`match_result`).~~ **Dropped 2026-08-08** — the match feed needs B-13. The mandatory "real-time updates reflected to all connected users" requirement is instead met by the lobby WS (`queue_state` / `room_state` broadcast to every member) and the game WS (15Hz snapshot fan-out).
6. When the opponent's tab is closed mid-match, the opponent status on the local screen transitions visibly from `disconnected(n sec left)` → `AI` (the demo scenario from ② §7-B).
7. Keyboard-only navigation can reach auth → queue join → match start (focus visible throughout).

## 7. Consistency checklist against ②③

| Reference | Where addressed in this document |
|---|---|
| ② §3 all Lobby WS messages | Assigned to the UI in the §3.2 table (`error` → toast) |
| ② §4-C match_found auto-navigation, no accept | §3.2 |
| ② §5-A input (hand is never sent) | §3.3 Input capture + D-14 (② was revised for this in ⑤ D-17) |
| ② §5-D "events are for effects; the snapshot is authoritative" | §3.3 separation of scoring effects and the score bar |
| ② §7-B "carry the disconnected(AI) display over to ④" | §3.3 Opponent status row |
| ③ §1-A error envelope / §1-B shared zod | §2 Toast / §3.1 form validation |
| ③ §2-D stats derivation rules | §3.4 Stats card (win_rate definition is not recomputed on the UI side) |
| GATE1_REPORT follow-up (serial texture fetch) | GameView's loading screen includes a progress bar (interim UX until E-08's on-demand loading is implemented) |
