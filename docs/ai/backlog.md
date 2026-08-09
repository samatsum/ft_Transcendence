# BACKLOG — Consolidated Backlog (⑤)

> Source: translated from the Japanese original at md_files/02_設計書/5-バックログ.md (archived).

**Positioning**: This is the authoritative document, at a granularity that can be transcribed directly into GitHub Issues, integrating the W/F-series issues derived from [WS_PROTOCOL_DESIGN.md](./ws-protocol.md) (②), [REST_API_DESIGN.md](./rest-api.md) (③), and [FRONTEND_DESIGN.md](./frontend.md) (④) with the E/G-series issues in §6 of [ENGINE_SEPARATION_DESIGN.md](./engine-separation.md) (①).
Historically the PM role transcribed this into Issues and tracked progress; as of 2026-08-05 the team has dissolved to a single active contributor (samatsum — see [`../human/はじめに/チーム体制.html`](../human/はじめに/チーム体制.html)), who now does this directly. Where acceptance-criteria detail exists in the individual design documents, it is referenced rather than repeated.
**Completion of this document marks the completion of the upstream process (①–⑤).** The former Q-1–Q-3 have been decided as D-16–D-18 (the comparison of options is recorded in §0).

---

## 0. Decision Log (former Q-1–Q-3 → D-16–D-18; finalized 2026-07-11)

### D-16 (former Q-1): `pf_load_texture` is **formally promoted to a path contract**

| Option | Summary | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A. Promote the path contract (adopted)** | As implemented for GATE1: `pf_load_texture(window, tex)`. The texture path string derived from `.cub` is treated as the contract key; the web side matches it against the keys in `manifest.json` (normalized with `./`) | No change to the already-validated implementation. Because ②§5-B's `welcome.map_text` scheme has native/web/server all read the **same `.cub` text**, the path string is already a single source of truth — the "path and loaded content drifting apart" problem that ID-based keys were meant to prevent structurally cannot occur. Also naturally consistent with native's existing load path (`t_tex.path`) | Fragile to texture renames (renaming requires regenerating the manifest plus fixing the `.cub` file) | Adopted |
| B. Use IDs (original proposal in Design Doc ①) | Make `t_texture_id` the contract key, and move the ID→path table into the platform layer | Type-safe; resilient to renames | Requires a dual overhaul of every texture-loading path (the `load_one_tex` family across common/fps/rsp) and of manifest generation. The safety this would buy is already provided by Option A, so there's nothing to recoup the investment | Rejected |

**Reason for adoption**: The risk that ID-based keys were meant to prevent (the path string and the actual loaded content drifting apart) is already structurally eliminated by `welcome.map_text`'s single-source-of-truth design.
What remains is an investment purely in "type elegance," which this project's schedule cannot recoup.
**Reflected in**: ①§2 and §4-A, already revised.

### D-17 (former Q-2): ②§5-A's `input.hand` is **removed**

| Option | Summary | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A. Remove (adopted)** | Shrink `input` to `{seq, yaw, mv, act?}` | Fully consistent with the game rules (USER_DOC §5: hand is changed by the **server** at respawn and when stepping into one's own zone; the player has no concept of choosing it). Removes both the "rewrite the hand" cheat surface and the validation code for an unused field simultaneously | If a future "choose your hand" rule is introduced, the protocol will need to change (can be added at that time) | Adopted |
| B. Keep as a reserved field (② original proposal) | Ignore it even if sent | Leaves room for future extension | YAGNI. A dead field where spec and implementation have drifted apart becomes a source of "what is this?" explanation cost during evaluation and a breeding ground for implementation mistakes | Rejected |
| C. Accept with server-side validation | Apply it only in situations where the rules allow it | — | No such "situation where it can be used" currently exists in the rules | Rejected |

**Reason for adoption**: Isomorphic to ②'s own principle ("events are presentation; the snapshot is the source of truth") — **hand is server-authoritative state**, and there is no reason to expose it on the input surface.
An input channel that accepts state as input is itself an entry point for cheating and inconsistency.
**Reflected in**: ②§5-A and §9, already revised. ④'s D-14 is written on the premise that it is removed.

### D-18 (former Q-3): the repository **keeps its current layout**, adding a web directory at the root

| Option | Summary | Pros | Cons | Verdict |
|---|---|---|---|---|
| **A. Keep current layout + add (adopted)** | Keep `Makefile`, `codes/`, `maps/`, `textures/`, `web/` at repo root as-is, and add `app/` (`app/backend/`, `app/frontend/`, `app/shared/`) and `infra/` | **Zero changes** to git history, Makefile, lint (which assumes `codes/PythonCodes` as project root), CI, or GATE1 deliverables. The history can directly show the evaluation-time narrative of "cub3D evolved in place" | Engine and web code coexist somewhat untidily directly under root | Adopted |
| B. Restructure under an `engine/` subtree (original proposal in ARCHITECTURE §3.2) | Move the entire cub3D tree under `engine/` | Tidier directory appearance | Requires fixing every path reference (Makefile, lint, CI, all design docs, `web/`'s serving paths), and history tracking degrades to relying on `git log --follow`. **The only gain is aesthetics** | Rejected |
| C. Split the engine into a separate repository | Separate via submodule / subtree | Independent versioning | The subject premise is a single-repo submission and "clone into an empty folder → single-command startup" (§9.1). Splitting it is nothing but an evaluation risk | Rejected |

**Reason for adoption**: Restructuring is "stopping something that works in order to buy aesthetics." We chose the option with the smallest change volume for I-01 (Day 1), freeing up effort for the core 14pt.
**Reflected in**: ARCHITECTURE §3.2, already revised.

## 1. Done

> Commit IDs are those of this repository (migrated 2026-07-14 by squashing the former repository's history into 4 commits.
> Mapping: docs=3174497 / E-01–07=e4b5c83 / E-08–09=16a921f / G-01–04=2f2dec5).

| Issue | Content | Commit |
|---|---|---|
| E-01–E-07 | Platform layer separation, `t_framebuffer`-ization, loop inversion, `render.wasm`, asset pipeline, **Gate 1: Chrome Canvas rendering (go decision)** | `e4b5c83` |
| (addendum) | Review feedback applied: dropped the `-Dpf_*` rename, excluded CR013, updated GATE1_REPORT | `e4b5c83` (folded in during the squash) |
| G-01 | Combatant-unification structural change spec ([ENGINE_PHASE2_REPORT.md](../../archive/03_実装レポート/2-エンジンPhase2レポート.md)) | `3174497` (bundled with the design doc) |
| E-09 | `.cub` memory-reader conversion (parse results confirmed identical across all 13 maps) | `16a921f` |
| E-08 | Web input, capture conventions, disabling PROFILE, loading only the textures a map needs (42/99), permanent policy for the `TextDecoder` shim | `16a921f` |
| G-02–G-04 | **Combatant unification**: turned the player into an EXTERNAL input-source node of the enemies list; unified movement/collision into `combatant_walk_axis` (per-combatant radius); made death/spawn combatant-based | `2f2dec5` |
| E-10 | **sim public API** (`game_create` through `game_destroy`, including `game_set_input_source`). ASan/LSan leak check OK across 3 RSP games × 1000 ticks. Pre-implemented the core of G-05 (making `target_score` part of match_rules, ②§4-B's 3–21) ([ENGINE_PHASE3_REPORT.md](../../archive/03_実装レポート/3-エンジンPhase3レポート.md)) | `6ee85f5` |
| E-11 | **`sim.wasm` headless build** (`make sim`, rendering sources not linked). Confirmed 3 instances × 2 games × 1000 ticks running concurrently in Node | `21bc5c2` |
| E-12 | **`game_apply_snapshot` + interpolation receiver** (`web_apply_snapshot` / `web_render_frame` / `web/snapshot_interp.js`). One-way demo established: sim.wasm → JSON → render.wasm (measured snapshot avg 513B < 1KB) | `55c5a82` |
| G-05 | **Formal acceptance of making the win score part of `match_rules`**. The engine now accepts N≥1 (the 3–21 range is consolidated into the responsibility of the WS layer, B-11 №6), satisfying ①§6's acceptance criterion "must also work with N=2 for testing." Verified via `make test` (`codes/tests/sim_test.c`) for effective values, default fallback, and exact-N decisions | `48a352c` |
| G-06 | **1v1-ization of the FPS goal**. Generalized `check_quest` from a single camera-based check to one based on all combatants; the seat that reaches the goal first has its `combatant_id` fixed into `fps.winner` (②§5-C). Introduced `t_enemy.is_hazard` to distinguish map-native enemies from seats. Removed `delete_sprite`, which deleted the first sprite matching a cell (a path that could mistakenly free a seat's body) | `346bbdd` |
| G-07 | **FPS multiple spawns (simultaneous 1v1 start)**. Each combatant now has a stable anchor fixed at creation time (`t_enemy.spawn`), and returns to its own spawn via `respawn_combatant` (①§4-C). Because FPS respawn no longer re-draws from all spawns, players no longer spawn on top of their opponent. Maps with only one spawn now fail FPS 1v1 generation | `463d78c` |
| G-08 | **Enemy hazard-ization**. Generalized contact detection, the death timer, and respawn to per-combatant units; death is now a penalty until returning to one's own spawn rather than a match-ending event (①§4-C). Hazard AI no longer targets a fixed camera and instead goes after the nearest living seat. **This resolves P1 from ENGINE_PHASE3_REPORT (headless FPS unable to reach a decision)** (includes 3 review fixes: banning same-tick goals for a dead seat, snapshot `alive` consistency, restoring layering lint) | `4618860`..`7f53991` |
| G-10 | **Disabled BMP saving**. Web excludes the save path from `render_frame` (render.js 60.4KB→57.3KB); sim has zero file I/O structurally as of E-11 (bmp.c/screen.c not linked). Native continues to save as before | `3086a8c` |
| G-09 | **Two online-match maps each**: adopted the existing `rsp` / `21x21_arena`, and additionally produced `rsp_pillars` (RSP map #2) / `fps_duel` (FPS map #2). Registered in the whitelist table at ③§2-E. Startup verification is now permanently part of the G-09 checks in `make test`. **In-team playtest approval obtained** (an earlier playtest failed on play feel, so samatsum revised the map and it was re-approved; samatsum is responsible for landing the revised version) | `dfc1cba`..`a4a74d4` |
| E-14 | **CI** (`.github/workflows/ci.yml`): on every PR, native build + `make check` + `make test` (85 checks) + xvfb-driven smoke test across 5 maps + `make web sim` inside an emsdk container + record.mjs end-to-end + TS typecheck/build. **All jobs reached green on 2026-07-23** (fixed a missing `libbsd-dev` and a `type:module` regression). I-16 is planned to add FE lint ([ENGINE_E13_E14_REPORT.md](../../archive/03_実装レポート/4-エンジンE13E14レポート.md)) | `c068aa8`, `908529d` |
| E-13 | **Rendering hardening**: `web_init` now takes an internal-resolution argument (default 960×540, clamped in C to 848×480–1920×1080), `engine_demo`'s `?res=`, `web/bench_render.mjs`. Measured 960×540=112fps / 1280×720=63fps (Node, dev machine) against the 60fps requirement — roughly 1.8x headroom, giving data to justify staged downscaling | `52d4f3c` |
| I-01 | **Repository skeleton** (D-18's "keep current layout + add"): added `app/backend` (Fastify+TS) / `app/frontend` (React+Vite+TS+Tailwind) / `app/shared` (zod contracts) / `infra` (nginx skeleton) via npm workspaces. Set up `tsconfig.base.json`, `.env.example`, `.gitignore`. **Acceptance criterion "backend/frontend start up" verified on real hardware** (confirmed /api/health connectivity, Vite's /api proxy, 404 in the ③§1-A envelope, TSX transform). All workspaces pass type-checking. No impact on the C side (make / check / test). **samatsum did this work first; from B-02 onward the backend-foundation lane is handed to torinoue**. Note: root's `"type": "module"` caused a regression where `web/build/*.js` (CommonJS emcc glue) was misidentified as ESM; fixed by pinning that directory to CJS scope in `web/package.json` (`908529d`) | `c0d0508` |

## 2. Engine lane (Engine lane / samatsum) E-08–E-14 — the remainder of ①§6 plus acceptance-criteria addenda

> **All Issues in this section are done** (results are in the Done table in §1; details are in the individual reports).
> What follows is kept as a record of what acceptance criteria were imposed at the time.
> The table in ①§6 remains authoritative; only addenda from review and from ② are recorded here.

| Issue | Addendum (added to ①§6's acceptance criteria) | Dependency |
|---|---|---|
| E-08 web input / time wiring | Must connect to ④§3.3's input-capture contract (capture/release, `preventDefault`, releasing all keys on `visibilitychange`). **Disable PROFILE output in the web build**. Load only the textures a map requires (stop reading the whole manifest). Decide the permanent policy for the `TextDecoder` shim (a GATE1_REPORT carry-over item) | E-07 |
| E-09 `.cub` memory-reader conversion | The texture contract must follow D-16 (formalizing the path contract) | E-04 |
| E-10 sim public API | **`game_set_input_source(game, combatant_id, AI\|EXTERNAL)` must be included in the public API** (an addendum requirement from ②§6-B) | E-09 |
| E-11 sim.wasm headless | No change | E-10 |
| E-12 snapshot receiver | Interpolation implementation split follows ④§4 (Engine = wasm calls and interpolation math, Frontend = hooks) | E-10, E-08 |
| E-13 rendering hardening | No change (GATE1's measured 90.78fps@960×540 recorded as the baseline) | E-07 |
| E-14 CI | Integrated with I-16 (3-target build + `make check` + native smoke on every PR) | E-05, E-11 |

## 3. Gameplay lane (Gameplay lane / samatsum) G-01–G-10 — the remainder of ①§6 plus addenda

> **All Issues in this section are done** (results are in the Done table in §1).
> The only thing that remained was G-09's in-team playtest approval, and that too was completed on 2026-07-23. What follows is a record of the acceptance criteria.

| Issue | Addendum | Dependency |
|---|---|---|
| G-02 input-source abstraction | **Switching via `game_set_input_source` is part of the acceptance criteria** (the foundation for AI takeover ⇔ recovery per ②§6-B / §7) | G-01 |
| G-05 win score as match_rules | The range for `target_score` per ②§4-B (3–21, default 10) is **guaranteed by schema validation at the WS layer (B-11 №6)**. The engine, as a mechanism, accepts N≥1, satisfying ①§6's acceptance criterion "must also work with N=2 for testing" (decided 2026-07-19, to avoid duplicating the range check and consolidate the responsibility into the server layer) | G-02 |
| G-09 match map production | Completed maps are registered in the whitelist table at ③§2-E and published | G-06 |
| Others (G-01/03/04/06/07/08/10) | Unchanged from ①§6 | — |

### 3.1 New gaps found during FPS 1v1 doc review (discovered 2026-08-07, not yet started, unassigned)

> samatsum walked through the FPS 1v1 code while answering docs questions and found two gaps neither the
> original ①§6 table nor G-06–G-08's "1v1-ize the FPS goal / hazard-ize enemies" work ever covered: what
> happens when one seat's combatant is targeted by the other seat's weapon, and what the other seat looks
> like on screen. Both are engine-side (`codes/`), so they belong to this lane rather than W/F.
>
> These two are also the first backlog items mirrored as real GitHub Issues — see
> [git-workflow.md](./git-workflow.md)'s "Tracking work: backlog.md + GitHub Issues" section for the
> convention (started 2026-08-08; earlier backlog rows were not backfilled).

| Issue | Title | Acceptance criteria | Dependency |
|---|---|---|---|
| G-11 | FPS's inherited single-player shoot mechanic can eliminate the other seat ([Issue #46](https://github.com/samatsum/ft_Transcendence/issues/46)) | `fps_mode_ops` still sets `can_shoot = 1` ([fps_mode.c](../../codes/srcs/fps/core/fps_mode.c)), and `shoot_target` → `damage_enemy` ([fps_shoot.c](../../codes/srcs/fps/core/fps_shoot.c), [enemy.c](../../codes/srcs/common/enemy/enemy.c)) does not exclude `is_player` nodes — it will `delete_enemy` a seat whose hp reaches 0 exactly like it would a hazard. This is a leftover from the base single-player cub3D subject's shoot-the-monster mechanic, not part of the documented "collect → door → race to goal" 1v1 design (architecture.md A4), and deleting a seat's combatant mid-match would desync the server's per-seat snapshot mapping in the online case. Fix by either disabling `can_shoot` in `fps_mode_ops` (the race design doesn't need it) or having `damage_enemy` skip `is_player` nodes. Add a `make test` case: two FPS seats face each other, one fires, assert the other seat's hp/existence is unaffected | G-06, G-08 |
| G-12 | FPS gives the other seat no visual appearance ([Issue #47](https://github.com/samatsum/ft_Transcendence/issues/47)) | [`apply_remote_combatant`](../../codes/srcs/platform/web/web_snapshot.c) only assigns a sprite texture inside `if (game->mode == MODE_RSP)` (the team/hand icon swap) — there is no equivalent branch for `MODE_FPS`, and [fps_assets.c](../../codes/srcs/fps/core/fps_assets.c) only loads first-person weapon/death/door/goal textures, never a third-person "other player" body texture. A remote FPS seat's display node therefore keeps whatever texture it last had (most likely `enemy_tex` if it was recycled from a hazard slot), making the opponent visually indistinguishable from a hazard 'M' or untextured. Add a distinct player texture + asset path (parallel to `fps_enemy_assets.c`'s `enemy_tex` loading) and an `else if (game->mode == MODE_FPS)` branch in `apply_remote_combatant`. Verify manually with 2 browsers: the opponent renders with a texture visually distinct from a hazard enemy | E-12, G-08 |
| G-13 | **PROPOSAL, not adopted** — per-player collection counters + colored doors for FPS ([Issue #48](https://github.com/samatsum/ft_Transcendence/issues/48)) | Currently FPS collection is a single world-shared pool (`game->world.collected`/`to_collect` in [fps_item.c](../../codes/srcs/fps/core/fps_item.c), explicitly documented in its own comment as shared across both seats) that opens every `D` door on the map at once — effectively "cooperate to unlock, then race to the goal." samatsum raised the idea of each seat having its own count that opens only *that seat's own* door (e.g. red collects 5 → red door only), and asked whether doing this now vs. later costs about the same. Checked: **yes, currently it does** — the wire contract for this (`world_delta.collected`/`doors_open` in [ws-protocol.md §5-C](./ws-protocol.md) / `app/shared/src/ws/game.ts`) is defined but has zero backend or frontend consumers yet, and the `MatchPlayer` DB schema (architecture.md §3.3) has no per-item-collected column planned either — so nothing is built on top of the current shared-pool assumption. That window closes once B-13 (persistence/stats) or F-09 (profile) decide whether to surface collection counts. Explicitly **deferred by samatsum's own call** ("capacity-limited; cooperate-then-race is fine for now") — do not start without an explicit go-ahead. If it is picked up later: (1) give FPS seats a `team`/color the way RSP already has, (2) split `collected` per seat instead of per world, (3) add a **new map character** for a colored door (`DOOR_CHAR` is currently a single hardcoded `'D'` in [config.h](../../codes/includes/config/config.h)) plus `.cub`-parser support, (4) update `open_doors()` to open only the matching-color door on that seat's count, (5) at least one new map, since no existing `.cub` has a colored-door cell | None (design discussion only) |

## 4. Backend / DevOps lane B系・I系 — new

> Originally planned as a torinoue + samatsum lane. As of 2026-08-05 torinoue is no longer active; samatsum is the sole
> contributor and every unfinished item below is unassigned (open for a future team member) rather than "torinoue's."
> Use the Issue-level 完了/未完了 status in the table, not a person's name, to read current state.

Numbered items in the acceptance-criteria column indicate mapping to acceptance criteria 1–6 in ②§10.

| Issue | Title | Acceptance criteria | Dependency | Day (14-day schedule; the 5-day-schedule day-equivalences are inline in §6's Gate table below) |
|---|---|---|---|---|
| I-01 (done) | Add repository skeleton (`app/backend/`, `app/frontend/`, `app/shared/`, `infra/`, TS tooling, `env.example`+`.gitignore`) | backend/frontend start up under D-18's layout (keep current layout + add) → **achieved** (§1) | — | 1 |
| B-02 | Fastify startup configuration (TS, pino, zod validation pipeline, ③§1 error-envelope/rate-limit middleware) | Invalid input returns 400/429 in the ③§1-A shape | I-01 | 2 |
| B-03 | Prisma + SQLite schema v1 (the 5 tables in ③§3) + migration | `prisma migrate` is wired into the compose first-run | I-01 | 2 |
| B-04 | Full auth suite (signup/login/logout/me, argon2id, session cookie, ③ D-4–D-8) | All ③§2-A behaviors + login-failure responses are indistinguishable | B-02, B-03 | 2–3 |
| B-05 | Origin validation (REST mutating routes + WS upgrade) and shared cookie authorization | Mutating routes/WS from a different Origin are rejected | B-04 | 3 |
| B-06 **(not declared, 2026-08-08)** | Avatar upload + nginx static serving (③§2-B) | Files over 2MB, spoofed Content-Type, or invalid magic bytes are rejected with 413/415 | B-04, I-15 | — (was 10) |
| B-07 **(not declared, 2026-08-08)** | Full friends API (③§2-C) | Duplicate bidirectional requests / self-requests return 409. Presence composition is returned | B-04, B-08 | — (was 10) |
| B-08 | **In progress: core implementation done, pending integration with B-04/B-05.** Lobby WS (②§3, §4): shared zod, UserContextRegistry, presence, FIFO, LobbyRoom, heartbeat/session index, synchronous claim → immutable MatchPlan | `npm run check:lobby` automatically checks ②§10-A. Confirmed exactly one MatchPlan is produced across the manual/60-second/full-room paths. Verified double-start prevention, simultaneous timeout, rollback on creation failure, replace-on-close, and 10-second room reconnection. The end-to-end check with real cookie auth will be closed out once B-04/B-05 are integrated | B-04, B-05 | 4–5 |
| B-09 (done) | MatchPlan → GameRoom creation → token commit → `match_found` + context release on lifecycle end (②§4-C–E) | **№2 achieved**: `npm run check:lobby` confirms real GameRoom creation across all 3 paths (manual/60-second/full-room). Automatically checks: 10-second connection wait, AI-ization of unconnected seats, context release when human count is 0 at close, rollback on creation failure/5-second timeout, GameRoom discard on delayed success, and zero leftover reservations | B-08, B-10 | 5 |
| B-10 (done) | GameRoom + `sim.wasm` integration (②§6; 30Hz tick, even-tick broadcast, state machine) | Multiple rooms run concurrently in Node. Tick-overload warning logs work | E-11 | 4–5 |
| B-11 (done) | Game WS (join/input/leave/welcome/snapshot/event; ②§5, reflecting D-17's revision) | **№6**: invalid messages (schema violations, over 4KB, seq going backwards, out-of-range rules) are discarded/errored per spec. **№5**: snapshot size measured < 1KB | B-10 | 5–6 |
| B-12 (done) | Disconnect/reconnect/AI takeover (②§7; 30-second grace period, `game_set_input_source`) | **№4 achieved**: verified via real WebSocket tests — tab-equivalent close → grace period → reconnect within 30 seconds (`welcome.resume=true` + immediate snapshot) → human resumes control; AI takeover confirmed on grace expiry; RSP abandons when all players leave; FPS forfeits after 30 seconds idle or explicit leave; departed-seat handoff to the persistence callback confirmed | B-11, E-10 | 6–7 |
| B-13 **(not declared, 2026-08-08 — restore candidate №1)** | Match persistence + `match_result` broadcast + history/stats API (②§6-C, ③§2-D) | **№1**: end-to-end from match creation → decision → DB row → lobby receives it. **№3**: a custom room with `target_score=3` decides at 3 points | B-11, B-03, B-09 | — (was 8–9) |
| B-14 (done) | `GET /api/maps` + `welcome.map_text` path (③§2-E) | What the server loads and what it distributes as text always match | B-10 | 8 |
| I-15 | Docker Compose + nginx TLS + single-command startup (ARCHITECTURE §2.4; first run includes cert generation, migration, and `make web`-equivalent asset conversion) | `git clone` into an empty folder → `docker compose up` → HTTPS connection from Chrome (measured per §9.1).<br>**Addition (2026-07-27, TL proposal)**: **`sim.wasm` and `render.wasm` must be generated by `docker compose up` alone, starting from an empty `web/build/`.** No assumption that the host has `emcc` — evaluator machines do not have Emscripten installed. Wire the existing `engine-build` service (`infra/docker/engine-build/Dockerfile`), which runs `make web sim`, directly into the startup path. Also ensure **generated artifacts are not root-owned on the host side when `HOST_UID`/`HOST_GID` are set** — `docker-compose.yml`'s `user:` currently defaults to `0:0` (root) if they're left unset, so this criterion is opt-in, not automatic; I-15 should decide whether to auto-detect the host UID/GID instead of requiring the user to set them (see `.env.example`, `infra/README.md`) | I-01 | 1, ongoing |

> **Verified 2026-08-09 — the emcc-free container build works.** All build artifacts (`node_modules`,
> `web/assets`, `web/build`, `dist`, `app/frontend/public/engine`) and the host's `~/emsdk` were deleted,
> then `docker compose run --rm engine-build make frontend-engine-assets` rebuilt everything with no
> Emscripten on the host. `render.wasm` and `sim.wasm` came out **byte-for-byte identical** to the
> previous artifacts (67,613 B / 39,601 B); only the `.js` glue differed, and only in emscripten's own
> minifier output (host 6.0.2 vs container 6.0.6). With `HOST_UID`/`HOST_GID` set to 1000 in `.env`,
> nothing was left root-owned. So the hardest half of this issue — "the evaluator has no emcc" — is
> already satisfied by the existing `engine-build` service. What remains is the rest of the stack:
> `docker-compose.yml` currently has **only** the `engine-build` service (no backend, frontend, nginx or
> db), so `docker compose up` builds assets and serves them over `python3 -m http.server` — it does not
> start the product.

> **Asset delivery is a separate constraint for I-15 (measured 2026-08-09).** `web/assets/textures/` is
> **212 MB** and must not be shipped naively.
>
> - **The format is deliberate — do not change it.** `.tex` is a raw uncompressed RGBA dump: `Goal.tex`
>   is exactly `2048 x 1024 x 4` plus an 8-byte header. The C engine `memcpy`s it straight into memory,
>   which is why the wasm carries no PNG decoder. Compressing the *files* would mean adding a decoder to
>   the engine.
> - **Compress in transit instead.** gzip takes `Goal.tex` from 8,388,616 B to **313,401 B (3.7%)**, so
>   the whole 212 MB moves as roughly 8 MB. nginx must enable gzip for these files — `gzip_static` with
>   pre-compressed `.tex.gz` is the better form, since re-compressing 212 MB per request is wasteful.
>   **Without this, a browser downloads 212 MB.**
> - **The same 212 MB currently exists in three places** (636 MB on disk): `web/assets/` (generated) ->
>   `app/frontend/public/engine/assets/` (copied by `make frontend-engine-assets`) ->
>   `app/frontend/dist/engine/assets/` (copied by Vite, because `public/` is copied verbatim). I-15 should
>   decide whether to bake these into the image or pass them through a named volume from `engine-build`,
>   and whether the `public/engine/` hop can be dropped. Baking 636 MB into an image would make
>   `docker compose up` painfully slow on the evaluator's machine.
| I-16 | CI (integrates E-14: 3-target build + `make check` + native smoke + FE lint/typecheck) | Runs automatically on every PR | I-01, E-05, E-11 | 3 |
| **B-17 (new, 2026-08-08)** | Server side of `spectate` — accept a non-participant connection, answer `welcome` with `role: "spectator"`, and include it in the snapshot fan-out | A third browser connects to a live match and receives snapshots without occupying a seat; the match's player count and AI-takeover logic are unaffected by spectators | B-11 | 11 |

> **Why B-17 is new**: the spectator module is part of the adopted +5pt bonus as of D-19, but the
> server side was never an issue — [`app/backend/src/game/ws.ts`](../../app/backend/src/game/ws.ts)
> answers `spectate` with `makeWsError('not_participant', 'spectate is not implemented')`, and
> `app/shared/src/ws/game.ts` still labels the message "実装は余力時のみ" (only if there's slack).
> The wire contract already exists (`role: 'player' | 'spectator'` in `welcome`), so this is
> implementation, not design. Filed under `B-` rather than `GV-` per the lane rule in
> [`./git-workflow.md`](./git-workflow.md): lanes follow **what the code is**, and `ws.ts` is Fastify
> backend code.
>
> **On the three rows marked "not declared"**: the 2026-08-08 module revision (D-19) dropped the modules
> that were the *only* reason those issues existed — "standard user management" (avatar, friends,
> profile) and "game statistics". The rows are **kept, not deleted**, because their acceptance criteria
> and dependency chains are the recovery plan if a module is restored: architecture.md §4.3 lists
> **B-13 as restore candidate №1** (it alone brings back "add another game", 2pt), so the row must
> survive intact. Not-declared rows are **out of the completion-rate denominator** on
> [`../human/開発状況/サーバー開発工程.html`](../human/開発状況/サーバー開発工程.html) — the percentage
> there measures work actually planned, not work already ruled out. Do not start these without an
> explicit decision to re-declare the module.
>
> **B-03 and B-04 are not affected and must still be built.** A database and email+password auth with
> hashed/salted passwords are **subject Chapter III mandatory requirements**, independent of module
> choice, and B-03 is additionally the ORM module (1pt) itself. What D-19 removed is only the avatar /
> friends / profile-page *surface*, not authentication or persistence of users.

## 5. Frontend lane F系・GV系 — new

> Originally planned as a mamiyaza + hminemur lane. As of 2026-08-05 neither is active. **F-01, F-02, GV-06, and
> GV-07 were nonetheless completed by samatsum solo** (2026-07-30–31; GV-07 merged 2026-08-07 via
> [PR #35](https://github.com/samatsum/ft_Transcendence/pull/35) — its own description notes hminemur was the
> planned owner but unreachable, so samatsum implemented it instead) — see the per-issue status below.
> F-03–F-05 and GV-08・F-11・GV-12 remain unassigned and not started (未完成), open for a future team member.
> F-09 and F-10 are **no longer declared** as of 2026-08-08 (D-19) — see the note under the table. Also see
> [`../human/はじめに/チーム体制.html`](../human/はじめに/チーム体制.html).

| Issue | Title | Acceptance criteria | Dependency | Day (14-day schedule; the 5-day-schedule day-equivalences are inline in §6's Gate table below) |
|---|---|---|---|---|
| F-01 (done) | Scaffold (Vite/React/TS/Tailwind/Router/ErrorBoundary/StrictMode) | Foundation for ④§6-1's zero-console-errors policy. Zero build warnings | I-01 | 1 |
| F-02 (done) | fetch wrapper + shared zod integration (③§1 error-envelope handling, toast integration) | 401 redirects to `/login`; errors appear as toasts | F-01 | 3 |
| F-03 | Auth screens + route guard (④§3.1, §1) | ④§6-3 | F-02, B-04 | 3 |
| F-04 | Common layout + **actual Privacy/ToS copy** (④§2, §3.5) | ④§6-4. Zero placeholder text | F-01 | 3–4 |
| F-05 | Lobby suite — **3 of ④§3.2's 5 regions** as of 2026-08-08 (Quick Match / Custom Room / Room view) + `useLobbySocket` per ④§4 | Queue join/leave/AI-fill, room create/join/rules/start, and `match_found` auto-navigation all work against the live lobby WS with no console errors | F-03, B-08, B-09 | 5–7 |
| GV-06 (done) | GameView integration (render.wasm loading, Canvas, interpolation receiver, input sending; wired to E-08/E-12) | A match works between 2 browsers and the spectator view doesn't break | F-05, E-12, B-11 | 6–7 |
| GV-07 (done) | Full HUD overlay suite (④§3.3's 8 elements) | ④§6-6 (grace→AI transition is displayed) | GV-06 | 7–8 |
| GV-08 | Match transition flow (match_found auto-transition → countdown → match_end modal → back to lobby) | No console errors while the WS connection is re-established mid-transition | F-05, GV-07 | 7–8 |
| F-09 **(not declared, 2026-08-08)** | Profile/stats/history + self-editing + avatar (④§3.4) | Files over 2MB show an immediate error. win_rate matches ③§2-D | F-02, B-13, B-06 | — (was 9–10) |
| F-10 **(not declared, 2026-08-08)** | Friends UI (④§3.2 friends region + ④§3.4 buttons) | Presence badge updates in real time | F-05, B-07 | — (was 10) |
| F-11 | Responsive + accessibility adjustments (④ D-13, §6-2/7) — **scope reduced 2026-08-08**: profile and friends screens no longer exist, so this now covers auth / layout / lobby / GameView / match-transition / spectator only | Confirmed at 375px full-screen. Reachable up to match start using keyboard only | F-04・F-05・GV-06・GV-07・GV-08・GV-12 | 11 |
| GV-12 **(now required, 2026-08-08)** | Spectator UI (④§3.3 spectator HUD) | A non-participant can watch a live match through to `match_end` without console errors, and the spectator HUD does not expose either seat's private input | GV-07, **B-17** | 11 |

> **F-05 lost 2 of its 5 lobby regions (2026-08-08).** ④§3.2 defines five: Quick Match, Custom Room, Room
> view, **Friends**, **Match feed**. Two of them have no data source under the revised lineup:
>
> - **Friends** reads `GET /api/friends` and `presence_update`, both owned by **B-07** (not declared).
> - **Match feed** prepends on `match_result`, which ②§7-B only emits after **B-13** persists the match —
>   `persistMatch` returns null without it, so the `onMatchResult` hook never fires. The old acceptance
>   criterion for F-05 was literally "the match feed reflects live updates", so it had to be replaced.
>
> **Ownership of `match_result` is therefore B-13 recovery scope, not active work** — that covers ②§5's
> `match_result` payload, ②§7-B's `persistMatch` closure, and ④§3.2's match-feed region as one unit. If
> B-13 comes back, all three come back together.
>
> **The mandatory requirement is still met without them.** Subject III's "real-time updates are reflected to
> all connected users" is satisfied by the lobby WS (`queue_state`, `room_state` to every member) and the
> game WS (15Hz snapshot fan-out to every participant) — neither needs the match feed. **A cheaper partial
> restore exists** if the feed is wanted later: broadcast `match_result` straight from GameRoom's in-memory
> outcome instead of after a DB write. That is a small backend change and does **not** require B-13, but it
> is not currently declared or planned — do not start it without a decision.

> **What D-19 changed in this lane (2026-08-08).** F-09 and F-10 are **not declared** and are out of the
> completion-rate denominator on
> [`../human/開発状況/フロントエンド開発工程.html`](../human/開発状況/フロントエンド開発工程.html); the rows
> stay so that restoring "game statistics" (which needs **B-13 and F-09 together**) doesn't have to be
> re-specified from scratch. Moving the other way, **GV-12 stopped being a reserve and became required**,
> because the spectator module is now part of the declared +5pt bonus — it needs **B-17** (server side)
> before it can be built. **F-03 is unaffected**: email+password login is a Chapter III mandatory
> requirement, not part of the dropped user-management module. **F-11's scope shrank** by two screens.

**Note on GV-06/GV-07's actual dependency order**: the table above records the *original* plan (GV-06 depends on
F-05, GV-07 depends on GV-06). In practice GV-06 and GV-07 were implemented **before** F-05 (lobby suite still
doesn't exist), because Gate-2 demoability was prioritized over following the planned order under solo
development. `GameView`/`HudOverlay` currently have no lobby to be launched from.

## 6. Gate/schedule mapping (update to ARCHITECTURE §7)

| Gate | Content | Issues that converge here | Status |
|---|---|---|---|
| Gate 1 (Day 2) | Canvas rendering of a static map | E-01–E-07 | **Passed (go)**, 2026-07-11 |
| Gate 2 (Day 7 → **Day 3 under the 5-day schedule**) | **A 2v2 RSP match is playable start to finish between 2 browsers** | E-08–E-12 / G-01–G-05 / B-08–B-11 / F-05・GV-06・GV-07・GV-08 | Not yet (**E, G, B-08 core, B-09–B-12, and GV-06/GV-07 are done**. What remains on the server side is B-08 integration with B-04/B-05; on the frontend side, F-05 (lobby, not started — GV-06/GV-07 currently have no lobby to launch from) and GV-08 (match transition, not started))<br>**B-12 (disconnect/reconnect/AI takeover) is not counted toward Gate 2 — it was carried out and completed on Day 4 instead** (consistent with the 5-day-schedule mapping in this same table). B-12 is ②§10-B №4 and is not something to be dropped |
| Gate 3 (Day 11 → **Day 4 under the 5-day schedule**) | Core 14pt fully working in the integrated environment | B-14, F-11, B-17・GV-12 (spectator bonus), G-06–G-09 (FPS-related), and everything else. **Revised 2026-08-08**: B-13 and F-09/F-10 no longer converge here | Not yet (**G-06–G-09 and B-14 are done**) |
| Day 12 (→ **Day 5**) | Hardening day (every item per the ARCHITECTURE §9.1 script) | Turned into a single Issue, H-01 (whole team) | Not yet |

### 6.1 Gate 2 pass criteria (end of Day 3)

**Gate 2 = human-vs-human play works.** Go once every item below is satisfied. (All items below are currently unchecked / not yet confirmed.)

- **2 browsers**: a 2v2 RSP match is playable start to finish (decided by win score → `match_end` → results screen)
- **4 browsers with 4 humans join the same match and play it through** (**no AI seat used at all**. This is the actual substance of core item #3, "3+ player multiplayer")
- Broadcast sustains 15Hz with no tick-overload warnings (broadcast fan-out must not break down with 4 players)
- Zero console errors during match transition and on leaving

> **Why the 4-browser check is placed here**: increasing the player count requires **no new code** (B-11 doesn't depend on connection count).
> If 2 browsers already work, it costs almost nothing to open 2 more tabs.
> Meanwhile, broadcast fan-out and tick overload only show up **once player count increases**.
> If found at Gate 3 (Day 4), only Day 5 would be left to fix it; found here, it can be fixed on Day 4.

### 6.2 Gate 3 pass criteria (end of Day 4)

**Gate 3 = the core 14pt work "module by module."** Doubles as a dry run of ⓪§9.1's "demo each module individually."

> **Module lineup revised 2026-08-08 (D-19).** The table below reflects the new selection — see
> [architecture.md §4](./architecture.md) for the authoritative list and §4.5 for why it changed.
> The previous lineup put two entirely-unstarted modules (standard user management, game stats) on the
> pass line while a finished one (AI opponent) sat in the bonus; that is now inverted.

| # | Module | pt | What is being judged | Status |
|---|---|---|---|---|
| 1 | Web game | 2 | RSP works as a real match | To be confirmed at Gate 2 (not yet run) |
| 2 | Remote players | 2 | Cross-browser match + disconnect/reconnect (B-12) | Gate 2 (B-12 itself is **done**) |
| 3 | 3+ player multiplayer | 2 | **4 humans in the same match** (no AI seats) | To be confirmed at Gate 2 (not yet run) |
| 4 | Frameworks on both FE/BE | 2 | React + Fastify demonstrable in code | **Done** (I-01 / F-01) |
| 5 | WebSockets | 2 | Game sync, connect/disconnect handling, broadcasting — all three satisfied by the game WS alone | B-11 **done**; lobby WS integration remains |
| **6** | **AI opponent** | **2** | RSP hand-based AI and FPS chase AI; AI fills disconnected seats | **Done** (promoted from bonus into the core) |
| 7 | ORM | 1 | Prisma's schema and migrations run on compose first startup | B-03 + I-15 |
| **8** | **Game customization** | **1** | Map selection + points-to-win, with defaults available | Engine params **done**; selection UI remains (promoted from bonus) |
| — | **Mandatory requirement** (not a module) | — | **Responsive at 2 sizes (375px and desktop width) / reachable up to match start using keyboard only** (subject III.3. **not a "nice to have"**) | F-11 |
| 9/10/11/12 | Bonus | +5 | Only declare items that are **fully working** (never declare something that doesn't work) | Advanced 3D (done, needs README justification) / design system (**1 more component + palette/typography/icons**) / **spectator (B-17 + GV-12 — the largest of the three gaps)** / health-check (`/api/health` exists; **status page + backup/recovery remain**). Only #9 is genuinely finished |

> **No longer on the critical path:** B-06 (avatar), B-07 (friends API), B-13 (match persistence),
> F-09 (profile screen) and F-10 (friends UI) were only required by the dropped modules. B-13 remains
> the highest-value optional issue — **on its own it restores "add another game" (2pt)**, since the FPS
> engine and matchmaking are already complete and only user history is missing. "Game statistics" (1pt)
> needs **B-13 and F-09 together**, so it is a separate, larger decision.
>
> **Newly on the critical path, in exchange:** **B-17** (server side of `spectate`) and **GV-12**
> (spectator HUD). Declaring the spectator module means it has to actually work at evaluation — an
> incomplete declared module scores 0 for that module (Chapter VII), so this pair is not optional
> polish. It is still a much smaller amount of work than the 5 issues it replaces.

**Critical path (updated 2026-08-08)**: the original core chain, E-08/E-09 → E-10 → E-11, is complete, and
**I-01/B-09/B-10/B-11/B-12/B-14 are done**, so the remaining work on the game-server side is
**B-02→B-03→B-04→B-05→B-08** (Fastify, Prisma, auth, Origin, and the final integration of real cookie
auth into the lobby WS), plus **B-17** for the declared spectator bonus. B-13 is no longer on this path.
In parallel on the frontend side: F-01, F-02, GV-06, and GV-07 are done. F-05 + GV-08 (both not started,
unassigned) are what's left to converge on Gate 2.
The C side (E-series, G-series) is entirely Done; only the TypeScript Backend/DevOps and Frontend lanes remain.
See [チーム体制.html](../human/はじめに/チーム体制.html) for current team status — as of 2026-08-05 the original 4-person plan no longer applies; samatsum is the sole active contributor.

## 7. Upstream Process Closure Declaration

- Design documents ①–⑤ are complete, and the trace now holds end-to-end from
  requirements ([ft_トランセンデンス.md](./requirements.md)) → architecture (ARCHITECTURE) →
  detailed design (①②③④) → execution plan (this document).
- Going forward, changes follow the "**revise the design doc, then implement**" workflow (per each document's principles section), so as not to create drift.
- Zero open decisions remain. The former Q-1–Q-3 have been finalized as D-16–D-18, with the comparison of options and reasons for adoption recorded in §0.
  Reflection into each authoritative document (①§2, §4-A / ②§5-A, §9 / ARCHITECTURE §3.2) is also complete.
