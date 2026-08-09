# ENGINE_SEPARATION_DESIGN — cub3D Engine Separation Detailed Design (①)

> Source: translated from the Japanese original at md_files/02_設計書/1-エンジン分離設計.md (archived).

**Position**: A detailed elaboration of [ARCHITECTURE_DESIGN.md](./architecture.md) §2.1–2.2.
Corresponds to the work order for the Engine lane's Day 1–5 and the Gameplay lane's Day 4–9 (**both lanes were carried out and completed by samatsum**).
**Principle**: Separate the engine in stages while **always keeping the native build (MiniLibX/X11) working**.
This document contains no implementation code (interface specifications and acceptance criteria only).

---

## Implementation status (as of 2026-07-23)

All work described in this document has been completed. It is written in the form of a schedule and acceptance criteria because it was originally a work order drafted before the work began — it does not describe "things still to do."

| Section | Content | Status |
|---|---|---|
| §1 | 3 layers × 3 build targets | Complete. All three of `make` / `make web` / `make sim` build successfully and are in operation |
| §2 | Platform layer `pf_*` | Complete. The only file that includes `mlx.h` is `platform/native/platform_native.c` (zero in the sim layer and render layer). Regressions are caught by CI's `web`/`sim` builds (which compile in an environment without MLX headers) |
| §3 | sim public API (`game_step` and others) | Complete. The authoritative source is [`codes/includes/platform/sim.h`](../../codes/includes/platform/sim.h). For APIs that were added since the original design, see "Differences between §3-B and the implementation" below |
| §4 | Asset pipeline / `.cub` memory reader / build | Complete. The game rule changes in §4-C (G-05 through G-10) have all been implemented as well |
| §5 | Phased migration steps S1–S7 | Complete (all of S1–S7). native was reached without ever being broken throughout the entire process |
| §6 | Issue backlog E-01–E-14 / G-01–G-10 | All 24 items closed |

**No *planned* work remains on the engine (C) side** — every E-/G- issue in §6 is closed.
Two defects were found afterwards and are still open, so "closed backlog" is not the same as
"defect-free": **G-11** (FPS shooting can eliminate the other seat —
[#46](https://github.com/samatsum/ft_Transcendence/issues/46)) and **G-12** (remote players have no
appearance in FPS — [#47](https://github.com/samatsum/ft_Transcendence/issues/47)). Both are real and
reproducible in the current code; see [backlog.md §3.1](./backlog.md).
Apart from those, what remains is the TypeScript server and frontend (B-02〜B-14・B-17・I-15・I-16 / F系・GV系).

- Detailed implementation records: [3-エンジンPhase3レポート](../../archive/03_実装レポート/3-エンジンPhase3レポート.md)
  / [4-エンジンE13E14レポート](../../archive/03_実装レポート/4-エンジンE13E14レポート.md)
- Handover notes for the next person to use this engine (the B-10 owner):
  the "Handover to B-10" section of [3-エンジンPhase3レポート](../../archive/03_実装レポート/3-エンジンPhase3レポート.md)
- Overall progress: [5-バックログ](./backlog.md) / ownership: [6-チーム分担計画](../human/はじめに/チーム体制.html)

---

## 0. Prerequisites (results of code inspection)

- **Verified against the latest HEAD** (`codes/srcs/{common,fps,rsp}` at the repo root).
  Confirmed from source that `t_game` has the structure documented in DEV_DOC: per-mode aggregation via `t_fps_data fps` / `t_rsp_data rsp`, plus `t_mode_ops` dispatch.
- Facts confirmed during inspection that are favorable for separation:

| Fact | Implication for separation |
|---|---|
| `draw_pixel` is an inline function that writes directly to `t_window.screen.ptr` (the pixel buffer) | The rendering system is **already framebuffer-oriented**. Dependence on MLX is limited to two points: "obtaining the buffer" and "transferring it to the screen" |
| MLX API calls are concentrated in 6 files (see table below) | The replacement surface is narrow, not scattered |
| Text rendering uses a homegrown `font.c` (does not use `mlx_string_put`) | UI rendering can be ported as-is |
| Input goes through a table conversion in `g_hold_keys[]` (X11 key code → logical axis `t_axis`) | Input abstraction is nearly complete once the logical axes `AXIS_*` are used as the boundary |
| `t_render` is a struct that bundles only the references needed from `t_game` for rendering | The rendering layer's arguments are already organized. Cutting the `t_game` dependency is straightforward |
| Time comes from `gettimeofday`, and FPS limiting is idle time via `usleep` | Time and sleep can be replaced by two platform-layer functions |
| The parallel renderer (`t_render_job` + pthread) splits by column and does not use mutexes | A structure that is easy to disable (single-thread) for the initial WASM build |
| `t_mode_ops` (a function table for init_assets/combat/update_enemy/draw_weapon, etc.) | Mode branching is already indirected through function calls, so an input-source abstraction (§3-C) can be added the same way |
| **RSP team scoring, first-to-N, and winner determination are already implemented** (`award_rsp_point` / `RSP_SCORE_LIMIT` / `rsp.winner`, with score UI display) | G-05 is reduced to just "make the first-to-N score configurable via `match_rules`" |
| **The FPS goal is already implemented** (an `IS_GOAL` cell + `clear_goal` + `goal_tex`) | G-06 is reduced to just "make it 1-vs-1 and attribute the winner." No new map character `G` is needed |

### Inventory of MLX/OS dependencies (full list of replacement targets)

| File | APIs used | Purpose | Migration target |
|---|---|---|---|
| `main.c` (command center) | `mlx_init` / `mlx_new_window` / `mlx_hook` ×4 / `mlx_loop_hook` / `mlx_loop` | Startup, event registration, loop driving | Platform layer (web: `requestAnimationFrame`; server: tick) |
| `core/init.c` | `mlx_new_image` / `mlx_get_data_addr` / `mlx_xpm_file_to_image` | Backbuffer creation, texture loading | `pf_create_framebuffer` / `pf_load_texture` |
| `srcs/common/engine/texture/texture.c` | `mlx_xpm_file_to_image` / `mlx_get_data_addr` / `mlx_destroy_image` | **The single aggregation point for all texture loading** (`load_one_tex`. Per-mode assets — 8-direction enemy sprites, 6 hand frames, goal texture, etc. — all route through here; there are no direct mlx calls under `fps/` or `rsp/`) | Same as above |
| `engine/render/screen.c` | `mlx_put_image_to_window` | Transfer the backbuffer to the screen | `pf_present` |
| `core/exit.c` | `mlx_destroy_image` / `mlx_destroy_window` / `mlx_destroy_display` | Cleanup | `pf_shutdown` family |
| `core/loop.c` | `gettimeofday` / `usleep` | Time, FPS limiting | `pf_now_ms` (sleeping becomes the driver's responsibility) |
| `config/*.c` (via gnl) | `open` / `read` (fd) | `.cub` loading | Memory-reader abstraction (§4-B) |
| `core/bmp.c` | `open` / `write` | Result screenshot | Kept native-only (disabled on web/server) |

---

## 1. Target structure (3 layers × 3 build targets)

```text
                    ┌───────────────────────────────────────┐
                    │  sim layer (platform-independent, t_game core) │
                    │  .cub parsing / movement & collision / enemy AI /  │
                    │  RSP win/loss & scoring / FPS goal detection        │
                    └──────────────┬────────────────────────┘
                                   │ display state (snapshot)
                    ┌──────────────▼────────────────────────┐
                    │  render layer (depends only on the framebuffer)      │
                    │  raycasting / walls, floor, sprites / UI / hands   │
                    └──────────────┬────────────────────────┘
                                   │ pf_* interface
      ┌────────────────────────────┼───────────────────────────┐
┌─────▼─────┐              ┌───────▼──────┐             ┌──────▼──────┐
│ platform/  │              │ platform/    │             │ platform/    │
│ native(MLX)│              │ web(Canvas)  │             │ headless     │
└─────┬─────┘              └───────┬──────┘             └──────┬──────┘
      ▼                            ▼                           ▼
 [native: cub3D]           [render.wasm: browser]      [sim.wasm: Node server]
  works as before            rendering + input only        sim layer only, no rendering linked
```

| Target | Layers linked | Purpose | Completion gate |
|---|---|---|---|
| `cub3D` (native) | sim + render + platform/native | Regression checks, minor fixes during evaluation, the team's dev environment | Buildable and runnable at all times throughout |
| `render.wasm` | sim (display support only) + render + platform/web | Browser rendering. **Does not simulate** (draws the server's snapshots) | Gate 1 (Day 2) |
| `sim.wasm` | sim + platform/headless | Server-authoritative simulation (30Hz) | Day 5 |

**All 3 targets are complete and running.**
The "Day" figures in the "Completion gate" column were rough estimates made before work began. Gate 1 was passed on 2026-07-11.
Build commands are `make` (native) / `make web` (`render.wasm`) / `make sim` (`sim.wasm`), and [CI](../../.github/workflows/ci.yml) automatically builds all three on every push.

---

## 2. Platform layer interface specification (`pf_*`)

Consolidated in the new header `includes/platform/platform.h`.
The completion condition is that **the sim layer and render layer include no MLX header whatsoever**.

| Function (conceptual signature) | Role | native implementation | web implementation | headless implementation |
|---|---|---|---|---|
| `pf_init(width, height)` → handle | Initialize the window / drawing surface | `mlx_init` + `mlx_new_window` | Obtain a Canvas (JS side) | no-op |
| `pf_create_framebuffer(w, h)` → `t_framebuffer` | Allocate a 32-bit pixel buffer | `mlx_new_image` + `mlx_get_data_addr` | A `malloc` buffer on the WASM heap | Not needed (not linked) |
| `pf_present(fb)` | Transfer the buffer to the screen | `mlx_put_image_to_window` | `putImageData` (the JS side reads WASM memory directly) | Not needed |
| `pf_now_ms()` → int64 | Monotonic milliseconds | `gettimeofday` | `performance.now()` (imported) | Node's clock (imported) |
| `pf_load_texture(window, tex)` → success/failure | Supplies an RGBA buffer **given a path** (the contract key is the texture path as it comes from the `.cub` file; revised per ⑤ D-16) | Wraps the existing XPM loading | Looks up pre-converted RGBA by the manifest's path key (`./`-normalized) and supplies it (§4-A) | Not needed |
| `pf_poll_events(input)` | Reflects logical axes/actions into `t_input` | X11 hooks (existing) | KeyboardEvent → logical-axis conversion (JS side) | Network input (Node side) |
| `pf_shutdown()` | Cleanup | The full `mlx_destroy_*` family | Buffer deallocation | no-op |

**Design notes**:

- `t_framebuffer` is a newly introduced struct holding only "pixel pointer, width, height, bytes per row."
  It replaces the role of the existing `t_window.screen` (`t_image`), and
  `draw_pixel` is changed to reference this struct instead (only the referenced type changes; the logic is unchanged).
- **Pixel format trap**: MLX is BGRA (little-endian int writes), while Canvas `ImageData` is RGBA.
  The conversion is either absorbed in one place by the JS equivalent of `pf_present` on the web side, or the channel order is switched by a build flag.
  **Decision: absorb it on the JS side** (keeps the C code fully identical across both targets).
- Inversion of loop driving: currently `mlx_loop` calls back into the app (push style).
  On web, `requestAnimationFrame`, and on the server, `setInterval`,
  **call the equivalent of `main_loop` for a single frame from the outside** (pull style).
  This means "processing for one frame" must be exposed as a function that takes arguments (§3). The `usleep` used for FPS limiting is removed and becomes the driver's responsibility.

---

## 3. sim layer core API (`game_step`) specification

### 3-A. Current flow subject to separation

Breakdown of the inspected `main_loop` and its migration target:

| Current `main_loop` processing | Migration target |
|---|---|
| `frame_delta` (time measurement, FPS limiting, `time_mult` calculation) | Moves to the driver side (`dt` passed as an argument). `calc_time_mult` stays in the sim layer |
| `apply_input` (`t_input` → camera movement/rotation) | Inside the sim layer's `game_step`. Generalized to apply **per combatant** (§3-C) |
| `check_quest` / `update_enemies` / `resolve_rsp_combat` / `check_enemy_contact` / `update_death` | Inside the sim layer's `game_step` (logic unchanged) |
| `render_frame` | Fully separated. **Not called** from `game_step` |

### 3-B. Public API (conceptual specification)

| API | Input | Output | Notes |
|---|---|---|---|
| `game_create(cub_text, mode, match_rules)` | The `.cub` text **in memory**, the mode, match rules (target score, etc.) | `t_game*` | The parser is changed to go through a memory reader to cut the fd/gnl dependency (§4-B) |
| `game_add_combatant(game, slot, is_ai)` | Slot number, AI flag | Combatant ID | RSP = 4 slots / FPS = 2 slots. For AI slots, the existing `update_rsp_enemy` / chase AI generates the input |
| `game_set_input(game, combatant_id, t_input)` | Per-combatant logical input | — | Server: from the WS connection / native: from `pf_poll_events` / web: unused (display-only) |
| `game_step(game, dt)` | Elapsed seconds | Match state (in progress/decided) | Updates for one full tick. Does not include rendering, I/O, or sleep |
| `game_snapshot(game, buf)` | — | Snapshot struct | §3-D. The server serializes and distributes it; the client passes it to `render_frame` |
| `game_apply_snapshot(game, snap)` | Snapshot | — | **Client-only**. Writes the received state into the display-side `t_game` (interpolation between two snapshots is done by the caller's JS) |
| `game_destroy(game)` | — | — | The MLX-free portion split out of the existing `exit.c` deallocation code |

**Implemented. However, there are differences from the original design** (the authoritative source is
[`codes/includes/platform/sim.h`](../../codes/includes/platform/sim.h)).

| Difference | Implementation | Reason |
|---|---|---|
| **One additional API** | `game_set_input_source(game, id, source)` was added | Needed so a disconnected slot's input source can be switched to AI mid-match (the reconnect spec from ②), i.e. a slot's input source must be changeable during a match |
| **A thin JS wrapper was added** | `sim_create(...)` / `sim_set_input(..., yaw)` | So JS doesn't need to assemble struct pointers itself. The `mv`/`yaw` → `t_input` mapping is the responsibility of platform/headless (② §6-B) |
| **`game_snapshot` returns a flat f64 array instead of a struct** | 5 header fields + 9 fields per combatant | Avoids sharing struct layout across the WASM boundary; the JS side can read it straight from `HEAPF64`. **JSON encoding and tick numbering are Node's responsibility** (② §5-B) |
| **`game_apply_snapshot` lives on the client side, not in the sim layer** | `codes/srcs/platform/web/web_snapshot.c` | The server does not use this function (it is not linked into `sim.wasm`). Interpolation is handled by `web/snapshot_interp.js` |
| **`seed` was added to `match_rules`** | A non-zero value fixes the RNG sequence | So a match is deterministically reproducible given the same input sequence (required for demo recording and B-10 integration tests) |

### 3-C. Multiplayer generalization (`t_game` change policy)

Currently, "the camera = the sole player, `t_enemy` list = NPCs." Comparison of alternatives:

| Option | Description | Pros | Cons |
|---|---|---|---|
| **Combatant unification (adopted)** | Generalize `t_enemy` into "combatant," with **the human also being one element of the list**. Each combatant holds a `t_rsp_state`, position, and facing; only the input source (AI / external input) differs. The camera is "derived every frame from the position/facing of one's own combatant ID" | Since RSP already has a "1 player + 3 NPCs = 4 combatants" structure, and `resolve_rsp_combat` looks at all cross-team pairs, this is the **minimal diff**. Swapping AI ⇔ human (AI takeover on disconnect) reduces to reassigning the input source | Player movement (`move_camera`) and enemy movement (`step_enemy`) currently have two separate collision-detection code paths that need to be unified |
| Parallel arrays | Introduce a new `players[4]`, managed separately from `t_enemy` | Doesn't touch existing code | Contact detection, rendering, and snapshotting all end up with two permanently more complex code paths |

**Concrete changes accompanying the adoption** (logic-level specification. Nominal ownership: Engine for structure, Gameplay for rules — in practice both were done by samatsum):

1. Add an "input source type (AI / EXTERNAL)" and a held `t_input` to the combatant struct.
   The `update_enemies` loop is restructured so that "if AI, the AI generates `t_input` → shared movement is applied."
2. Movement application is unified around the `move_camera` family (X/Y axis separation, wall sliding, `WALL_MARGIN`), and
   the enemy's `step_enemy` uses this as well (the collision radius becomes a combatant parameter:
   `PLAYER_RADIUS`/`ENEMY_RADIUS` are unified).
3. At render time, "every combatant other than yourself" uses the existing enemy sprite rendering (8-direction / hand display) unchanged. "Yourself" becomes the camera and is therefore not drawn (same as current behavior).
4. The death animation `death_timer` and `spawn` are held per combatant (currently only for the single player).

All 4 items above are implemented (G-01 through G-04).
The player became one node in the `world.enemies` list, and the difference between an AI slot and a human slot is now
just `input_source` (`AI` / `EXTERNAL`). "Ownership: Engine for structure, Gameplay for rules" was the original division of labor
plan; in practice, samatsum carried out both ([6-チーム分担計画](../human/はじめに/チーム体制.html)).

### 3-D. Snapshot structure (source data for WS distribution)

| Field | Content | Update frequency |
|---|---|---|
| `tick` | Server-side tick number | Every tick |
| `match` | State (waiting/playing/finished), winner, score (per team or per individual) | Every tick |
| `combatants[N]` | id / team / hand / pos(x,y) / dir_angle / alive / is_ai / respawn_timer | Every tick |
| `world_delta` | List of collected item coordinates, door-open flags (FPS mode only) | Only on change |

- Stays **under 1KB per message** with 4 combatants plus small fixed-size data (JSON is sufficient).
- Enemy AI (FPS obstruction hazards) is distributed in the same `combatants` format (the client does not distinguish and renders them the same way).
- The client's `render_frame` simply reads a display-side `t_game` that has been written with the interpolated result of two snapshots.
  **There is no win/loss judgment code on the client** (server authority is strictly enforced).

`tick` / `match` / `combatants[N]` are implemented. However, the wiring differs from the design in some respects.

- The sim does not hold `tick`. **Tick numbering is owned by Node (the server)**
  (② §5-C). What sim returns is just a flat f64 array of 5 header fields + 9 fields per combatant.
- **Only `world_delta` is unimplemented** (the sole intentional deferral).
  It was skipped because it is not needed for the Gate 2 RSP 2v2 milestone. It will be added when FPS goes online (B-14), via
  "accumulating the list of collected coordinates + sending the full set on the initial message"
  (handover item #2 in [3-エンジンPhase3レポート](../../archive/03_実装レポート/3-エンジンPhase3レポート.md)).
- "Under 1KB per message" and "no win/loss judgment code on the client" have both been achieved.

---

## 4. Peripheral specifications

### 4-A. Asset pipeline (the XPM problem)

| Item | Decision |
|---|---|
| Conversion | At build time, batch-convert XPM → raw RGBA (a custom `.tex` binary with a width/height header). The conversion script reuses the existing XPM-processing assets in `PythonCodes/` |
| native | Uses `mlx_xpm_file_to_image` as before (unchanged) |
| web | fetches the converted `.tex` files, writes them into WASM memory, and `pf_load_texture` returns them |
| Texture contract key | **The texture path string as it comes from `.cub`** is adopted as the formal contract (⑤ [BACKLOG.md](./backlog.md) D-16. The original idea of turning `t_texture_id` into an ID space was not adopted). web matches against the path keys in the `manifest.json` generated at conversion time, with `./` normalization; native reads `t_tex.path` directly as before |

### 4-B. `.cub` input path

- Current: `open` + gnl (fd-dependent). Neither the server nor the browser should depend on a filesystem.
- **Decision**: Introduce a thin reader abstraction that changes the parser's unit of reading from "one line from an fd" to "one line from in-memory text."
  native is unified to "read the whole file first, then feed it into the same memory reader" (gnl may remain for the initial read only).
- Map validation logic (wall closure, character set, spawn count) runs **once, at server startup**. Clients trust the already-parsed result.

### 4-C. Game rule changes (scope of the Gameplay lane; entirely contained within the sim layer)

| Change | Target | Specification |
|---|---|---|
| RSP scoring | `resolve_rsp_combat` | On combat resolution, +1 to the winning team. Reaching `match_rules.target_score` (default 10) sets `match.finished`. Instant respawn and hand changes retain current behavior |
| FPS goal | New map character `G` | Added to `VALID_MAP_CHARACTERS`. The instant a combatant enters the goal cell, `match.finished` is set and the winner is determined. Collect-then-open-door `D` remains a gate, as currently specified |
| FPS 1v1 | Spawning | FPS mode also allows multiple `N/S/E/W` spawn points (reusing RSP's `setup_rsp_combatants` selection logic) |
| Enemy hazard | `check_enemy_contact` | Contact = death → respawn at own spawn point a few seconds later (match continues). Changes the current "death animation → match end" behavior to a "penalty" |
| Result screen | `bmp.c` | BMP saving is disabled on web/server (native only). Results are saved to the DB instead, so this is unnecessary |

All 5 items above are implemented (G-05 / G-06 / G-07 / G-08 / G-10). Details decided during implementation:

- **The lower bound of `target_score` is 1**. The "default 10" is `RSP_SCORE_LIMIT` (the default used when a value ≤ 0 is passed).
  The product-level range of 3–21 is not validated by the engine. **Range checking is the WS layer's responsibility**
  (② B-11 #6); the engine, as a mechanism, also runs short test matches (N=1, N=2).
- **The map character `G` was not newly introduced.** Goal detection (the `IS_GOAL` cell + `goal_tex`) was
  already implemented beforehand (see the table in §0), so G-06 only required
  "attributing the winner to a combatant ID."
- A bug where a dead slot could still reach the goal or collect items within the same tick was flagged during review and fixed
  (slots with `death_timer > 0` are excluded from `check_quest`). This is pinned by a regression test.
- The above is automatically verified against the acceptance criteria by [`codes/tests/sim_test.c`](../../codes/tests/sim_test.c) (85 checks), runnable via `make test`.

### 4-D. Build design (3 Makefile targets)

| Item | Decision |
|---|---|
| Source classification | Re-classify the existing `COMMON_SRCS`/`FPS_SRCS`/`RSP_SRCS` by layer: `SIM_SRCS` (config/core/enemy/rsp/utils/gnl), `RENDER_SRCS` (engine/render, the drawing side of raycast, ui, the non-MLX part of texture), `PLATFORM_{NATIVE,WEB,HEADLESS}_SRCS` |
| Emscripten policy | Optimization `-O2`. pthread disabled (the parallel renderer stays native-only). Memory growth allowed. Only the §3-B APIs are exposed publicly. Modularized so multiple instances can be created from the JS side (a prerequisite for the server's N × GameRoom) |
| Verification | CI runs builds for all 3 targets on every PR (catches native-breaking regressions immediately) |

Implemented (E-05 / E-11 / E-14). CI is defined in
[`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), and
all jobs were confirmed green on 2026-07-23. In addition to building all 3 targets, it automatically runs `make check` (lint), `make test` (85 checks), and a
native startup smoke test under xvfb.

The Makefile has 2 additions beyond the original design:
automatic header-dependency generation (`-MMD -MP`, preventing failures caused by stale mixed-in `.o` files), and
a `make test` target (links directly with gcc, no emcc required).

---

## 5. Phased migration steps (an order that never breaks native)

**S1 through S7 are all complete.**
The "estimate" column reflects the schedule drawn up before work began, not actuals.
The completion condition for each row has been fully met, and **native was never broken even once throughout the entire process**
(a startup check against `maps/fps_map/1.cub` and `maps/rsp_map/rsp.cub` was performed after each step).

| Step | Content | Completion condition (acceptance criteria) | Estimate |
|---|---|---|---|
| S1 | Introduce `platform.h`. Rewrite the 6 files with MLX calls to go through `pf_*` (the native implementation is just relocating existing code) | native works with all maps as before. No `mlx.h` include remains in the sim/render layers | Day 1 |
| S2 | Separate time measurement out of `main_loop`, inverting it into "a one-frame function + external driving." Remove `usleep` | native works as before (driving still via `mlx_loop_hook`, only the internals inverted) | Day 1–2 |
| S3 | **Emscripten spike**: display a single static map on Canvas via the render layer + platform/web | Walls, floor, and ceiling render in the browser with no console errors = **Gate 1** | Day 2 |
| S4 | Wire up input and time to the web implementation | First-person movement and rotation work in the browser (standalone, local) | Day 3 |
| S5 | `.cub` memory-reader-ification + APIfication of `game_create`/`game_step`/`game_snapshot` | The headless build (`sim.wasm`) runs RSP for 1000 ticks on Node with no errors and returns snapshots | Day 4–5 |
| S6 | Combatant unification (§3-C): input-source abstraction, movement unification, per-combatant death/spawn | No regression in native RSP/FPS (play feel unchanged). A mixed test with 3 AI slots + 1 external-input slot passes | Day 4–5 (in parallel with S5, merged in by Gameplay) |
| S7 | `game_apply_snapshot` + the client-side interpolation receiver | A one-way demo of "Node's sim.wasm → JSON → the browser's render.wasm" is achieved | Day 5–6 |

**Regression-check criteria**: After each Step, launch native against `maps/fps_map/1.cub` and `maps/rsp_map/rsp.cub` and
confirm that the operations and rules described in the existing USER_DOC §2–5 are unchanged (the `make check` lint gate is also kept in force).

---

## 6. Issue-level backlog (C-code related)

Granularity that can be transcribed directly into GitHub Issues. Numbers in the Dependencies column refer to Issue numbers within this table.

**All 24 items are closed** (E-01–E-14 / G-01–G-10). The table below is the pre-work plan;
the "Acceptance criteria," "Dependencies," and "Estimate" columns reflect the state at that time. **No open Issues remain.**

- "Engine owner" / "Gameplay owner" reflect the original division-of-labor plan under the initial 4-lane structure.
  In practice, samatsum completed both lanes solo.
  The currently valid ownership table is [6-チーム分担計画](../human/はじめに/チーム体制.html).
- The implementation content and verification results for each Issue are summarized across the 4 documents in
  [03_実装レポート](../../archive/03_実装レポート/).

### Engine lane (in practice: samatsum)

| # | Title | Acceptance criteria | Dependencies | Estimate |
|---|---|---|---|---|
| E-01 | Finalize the `platform.h` interface (dependency sites verified against HEAD) | The function list matches §2's table and is approved in header review | — | 0.5 day |
| E-02 | Implement the native platform layer (relocating existing MLX code) | native regression-clean on all maps. Zero `mlx.h` includes in the sim/render layers | E-01 | 1 day |
| E-03 | `t_window.screen` → `t_framebuffer`-ify, and switch `draw_pixel`'s references | native regression-clean | E-02 | 0.5 day |
| E-04 | Invert the loop (one-frame function, `usleep` removal, `dt` as an argument) | native regression-clean. The one-frame function contains no I/O or sleep | E-02 | 0.5 day |
| E-05 | Emscripten build environment and a minimal `render.wasm` build | Build succeeds, `.wasm` is produced | E-03 | 0.5 day |
| E-06 | XPM → RGBA conversion script and asset loading (web) | All textures (walls/objects/8-direction enemy sprites/6 hand frames/weapons/death screen) load on web | E-05 | 0.5 day |
| E-07 | **Gate 1**: static map rendering on Canvas (including BGRA → RGBA absorption) | Renders in Chrome with zero console errors | E-05, E-06 | 0.5 day |
| E-08 | web input (KeyboardEvent → logical axis) and time wiring | Movement, rotation, and UI toggles work in the browser | E-07 | 0.5 day |
| E-09 | `.cub` memory-reader-ification | native and headless produce identical parse results for the same `.cub` | E-04 | 0.5 day |
| E-10 | sim public API (`game_create`/`set_input`/`step`/`snapshot`/`destroy`) | 1000 consecutive ticks run on Node; leak check passes | E-09 | 1 day |
| E-11 | `sim.wasm` headless build (rendering symbols not linked) | Multiple instances can be created from Node | E-10 | 0.5 day |
| E-12 | `game_apply_snapshot` and the display-state receiver | A one-way demo of sim.wasm → JSON → render.wasm is achieved | E-10, E-08 | 1 day |
| E-13 | Rendering-performance hardening (parameterized internal resolution, measurement) | 60fps at 960×540 (on the dev machine baseline). If not met, present data justifying staged resolution reduction | E-07 | 0.5 day |
| E-14 | Add 3-target builds + native startup smoke test to CI | Runs automatically on every PR | E-05, E-11 | 0.5 day |

### Gameplay lane (in practice: samatsum)

| # | Title | Acceptance criteria | Dependencies | Estimate |
|---|---|---|---|---|
| G-01 | Spec review for combatant unification (elaboration of the 4 items in §3-C) | Agreement reached with Engine on a change spec (struct field table) | E-04 | 0.5 day |
| G-02 | Introduce input-source abstraction (AI / EXTERNAL) | A native mixed test with 3 AI slots + 1 external slot behaves the same as current RSP | G-01 | 1 day |
| G-03 | Unify movement/collision (integrate player/enemy, parameterize radius) | native regression-clean (confirmed no wall-sliding issues or clipping on existing maps) | G-02 | 1 day |
| G-04 | Per-combatant death/spawn/respawn_timer | RSP's instant respawn and FPS's death penalty both work per-combatant | G-03 | 0.5 day |
| G-05 | Make first-to-N score configurable via `match_rules` (scoring/first-to-N/winner determination already implemented) | Make the fixed `RSP_SCORE_LIMIT` value configurable per match. Also works with N=2 for testing | G-02 | 0.25 day |
| G-06 | 1v1-ify the FPS goal (goal detection / `goal_tex` already implemented) | Winner is attributed based on which of the 2 combatants reaches the `IS_GOAL` cell first. `D`-gate/collection rules stay as-is | G-03 | 0.25 day |
| G-07 | FPS multi-spawn support (simultaneous 1v1 spawning) | 2 combatants can start simultaneously from different points | G-06 | 0.5 day |
| G-08 | Hazard-ify enemies (contact = respawn penalty) | Match continues after the death animation; the match does not end | G-04 | 0.5 day |
| G-09 | Create 2 online-match maps each for RSP/FPS | Approved via startup verification + in-team playtesting | G-06 | 1 day |
| G-10 | Disable BMP saving on web/server and clean up result data | No file I/O occurs during headless execution | E-10 | 0.5 day |

**Critical path**: E-01 → E-02 → (E-03/E-04) → E-05 → E-07 (Gate 1) → E-08, and E-09 → E-10 → E-11 → E-12.
The G series can start in parallel once E-04 is agreed upon.
Engine totals ≈ 8.5 person-days, Gameplay totals ≈ 6.5 person-days, fitting within the 2 lanes across Day 1–9 (including buffer).

**This critical path has been walked to completion.** Gate 1 (E-07) was passed on 2026-07-11, and
the final item, E-13, was completed on 2026-07-23.

---

## Revision history

| Date | Content |
|---|---|
| 2026-07-11 | §2, §4-A: revised `pf_load_texture` from an ID contract to a **path contract** (⑤ [BACKLOG.md](./backlog.md) D-16. Formalizes the GATE1 implementation. Options comparison is in ⑤ §0) |
| 2026-07-23 | With the completion of all 24 Issues (E-01–E-14 / G-01–G-10), **implementation status made explicit in each section**. Added to §3-B a diff table against the implementation (addition of `game_set_input_source`, the flat f64 snapshot, `seed`); noted in §3-D that `world_delta` is unimplemented; added to §4-C the `target_score` lower bound and the non-adoption of map character `G`. Wrapped long lines for readability |
