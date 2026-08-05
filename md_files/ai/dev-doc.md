# DEV_DOC — Developer Architecture Reference

> Source: translated from the Japanese original at md_files/04_エンジン資料/開発ドキュメント.md (archived).

This document is a technical reference for developers who maintain and extend the cub3D engine. It covers **only content that matches the actual source code**.

---

## 1. Overview

cub3D is a first-person 3D renderer built on MiniLibX (X11), with game logic layered on top: collectible items, doors, **patrolling/pursuing enemy AI**, and weapon switching. On the same engine, specifying a map under `maps/rsp_map/` runs **Rock-Paper-Scissors tag (RSP mode)**.

Rendering uses raycasting (DDA), scanning the screen column by column to draw walls, floor, ceiling, and sprites — a classic technique.

**Important change after the ft_transcendence migration**: the engine no longer talks to MiniLibX directly; it now runs **through the platform layer `pf_*` (`includes/platform/platform.h`)**. From the same sim/render code, three targets are built: **native (MiniLibX) / web (`render.wasm`) / headless (`sim.wasm`, the server-authoritative sim)** (see [1-エンジン分離設計](../02_設計書/1-エンジン分離設計.md)). Also, the player is not a special case — it is **one node in the combatant list** (the only difference is whether the input source is AI or external. See §5).

The lifecycle is as follows (`codes/srcs/common/main.c`, for native):

```
main()
  └── validate_check() : argument check + determine mode from map path + init_config + parse .cub (parse_config)
  │                      game->mode is determined by maps/fps_map/ vs maps/rsp_map/
  └── setup_inits()    : init_game + finish_init
  │                      (window creation, texture loading, building the sprite/enemy list,
  │                        creating the local combatant node, counting collectibles,
  │                        building the cell attribute flag layer, generating precomputed tables.
  │                        In RSP mode, this also loads hand textures and places the 4 combatants)
  └── pf_setup_hooks() : registers event/loop hooks with the platform layer
  └── pf_loop()        : from here on, main_loop() is called every frame
```

Per-frame processing is split into **"time measurement → one-frame function"** (`codes/srcs/common/core/loop.c`). web / headless drive their own loop and call `game_frame` / `game_step` directly.

| Function | Role |
|---|---|
| `main_loop` | native-only. Measures elapsed time and returns immediately if under the FPS cap (busy-wait, since none of the allowed functions include sleep), then calls `game_frame` |
| `game_frame(game, dt)` | `game_step` + `render_frame` + `pf_present`. **Not linked in the sim build** (because it includes rendering) |
| **`game_step(game, dt)`** | **State update only. Contains no drawing, I/O, or sleep**. Also serves as the public sim API; returns 1 if the match is already decided |

The contents of `game_step` (the order matters):

1. If already decided (`cleared`), return 1 immediately
2. `update_death` — advances the death timer for **every combatant**; expired combatants go through mode-specific respawn handling (independent per seat in 1vs1)
3. If a local seat exists and is alive, `apply_input` — applies input to the camera coordinate system and writes it back to the combatant node
4. `step_external_combatants` — applies buffered input to non-local external-input seats (human seats on the server); a no-op on native/web standalone
5. `update_enemies` — mode-specific AI for AI seats only (FPS: sense → patrol/pursue; RSP: rock-paper-scissors AI. See §3 / §4). Dead seats are not moved
6. `mode_ops.combat` — FPS uses `check_enemy_contact` (hazard contact = death penalty; the match continues), RSP uses `resolve_rsp_combat` (rock-paper-scissors outcome)
7. `check_quest` — checks the feet of **every combatant** for goal reach / item collection (dead seats are excluded)

Rendering is `render_frame` → `update_screen` → `pf_present`.

## 2. Directory Layout (as it actually is)

Source is split into three lines: **`common` (shared by both modes) / `fps` (FPS-specific) / `rsp` (RSP-specific)**, with public headers gathered under `codes/includes/` (`-I codes/includes`).

```
ft_transcendence/
├── Makefile                          # 4 targets: native / web(render.wasm) / sim(sim.wasm) / test
├── README.md / md_files/             # Documentation set (AI entry point: md_files/ai/README.md; human entry point: md_files/ja/index.html)
├── docker-compose.yml / .env.example / .github/workflows/ci.yml
├── codes/
│   ├── includes/                     # Public headers
│   │   ├── types.h                   # t_game facade, render flags, input/world/asset/cache types
│   │   ├── tuning.h                  # Compile-time fixed tuning values and spec constants
│   │   ├── config/{config.h, defaults.h}
│   │   ├── core/{core.h, respawn.h, collision.h, mode_ops.h}
│   │   ├── platform/                 # ★ platform boundary
│   │   │   ├── platform.h            # pf_* interface (implemented by native/web/headless) + web public API
│   │   │   └── sim.h                 # ★ authoritative definition of the sim public API and snapshot layout
│   │   ├── engine/
│   │   │   ├── input/{input.h, keymap.h}
│   │   │   ├── raycast/raycast.h     # t_camera, t_ray
│   │   │   ├── render/{render.h, light.h}
│   │   │   └── texture/texture.h
│   │   ├── enemy/{enemy.h, enemy_types.h, enemy_utils.h}
│   │   ├── rsp/{rsp.h, rsp_game.h}   # RSP types / pure rules — and the API that acts on t_game
│   │   ├── gnl/get_next_line.h
│   │   ├── ui/{ui.h, font.h}
│   │   └── utils/utils.h
│   │
│   ├── srcs/
│   │   ├── common/                   # Engine + command/dispatch layer (shared by both modes)
│   │   │   ├── main.c                # native entry point (determines mode from map path)
│   │   │   ├── config/               # .cub parsing and validation
│   │   │   │   ├── config.c          # init/clear, key mapping table g_keys[], overall parse control
│   │   │   │   │                     # parse_config_text = the path that reads from an in-memory text buffer
│   │   │   │   ├── parse_map.c       # map body → int array, assigns CELL_PATROL to P cells
│   │   │   │   ├── check_map.c       # bounds / column count / character-set checks (VALID_MAP_CHARACTERS)
│   │   │   │   ├── parse_params.c    # R / F / C and scalars (MS/RS/FOV/ET/ES/EH). g_scalars[]
│   │   │   │   └── parse_texture.c   # NO/SO/WE/EA/ST/FT and OI1..5 / OP1..5 / OC1..5
│   │   │   ├── core/
│   │   │   │   ├── loop.c            # main_loop / game_frame / ★game_step (the core of state updates)
│   │   │   │   ├── init.c            # finish_init, scan_world_sprites
│   │   │   │   ├── exit.c            # releases all resources (clear_assets is also used by game_destroy)
│   │   │   │   ├── respawn.c         # per-combatant death timer / respawn (respawn_combatant)
│   │   │   │   ├── combatant.c       # ★applies input to external-input seats (human seats on the server)
│   │   │   │   └── collision.c, bmp.c
│   │   │   ├── engine/
│   │   │   │   ├── input/input.c     # key handling (WASD + arrow keys + FPS-only 1/2/3/Space + I/L/O/Esc)
│   │   │   │   ├── raycast/{raycast.c, camera.c, spawn.c, spawn_marker.c}
│   │   │   │   ├── render/{screen.c, draw.c, draw_wall.c, draw_sky_floor.c, sprite.c,
│   │   │   │   │           sprite_utils.c, cast_columns.c, light.c, tables.c,
│   │   │   │   │           draw_weapon.c}  # draw_weapon = weapon-draw dispatch + shared draw_overlay
│   │   │   │   └── texture/{texture.c, color.c}
│   │   │   ├── enemy/{enemy.c, enemy_path.c, enemy_move.c, enemy_patrol.c}  # combatant list management + sensing/movement/patrol
│   │   │   ├── gnl/{get_next_line.c, get_next_line_utils.c}
│   │   │   ├── ui/{font.c, ui.c, crosshair.c}  # text rendering, minimap, crosshair (both modes)
│   │   │   └── utils/                # libft-equivalent hand-rolled utilities (pos.c has set/copy/dist_pos)
│   │   │
│   │   ├── platform/                 # ★ per-target implementations (the bodies of pf_*)
│   │   │   ├── native/platform_native.c   # MiniLibX/X11
│   │   │   ├── web/{platform_web.c, web_main.c, web_snapshot.c}
│   │   │   │                              # web_main = JS public API / web_snapshot = game_apply_snapshot
│   │   │   └── headless/{platform_headless.c, sim_api.c}
│   │   │                                  # sim_api = game_create..game_destroy (server-authoritative sim)
│   │   │
│   │   ├── fps/                      # FPS-mode-specific (3 layers: core/enemy/render)
│   │   │   ├── core/{fps_shoot.c, fps_item.c, fps_respawn.c, fps_mode.c, fps_assets.c}
│   │   │   ├── enemy/{fps_enemy_ai.c, fps_enemy_assets.c, fps_enemy_sense.c}
│   │   │   └── render/fps_weapon.c
│   │   │
│   │   └── rsp/                      # RSP-mode-specific (3 layers: core/enemy/render. See §4)
│   │       ├── core/{rsp_mode.c, rsp_setup.c, rsp_assets.c, rsp_rule.c, rsp_combat.c}
│   │       ├── enemy/rsp_enemy_ai.c  # NPC AI: update_rsp_enemy
│   │       └── render/rsp_weapon.c   # rock-paper-scissors hand overlay drawing: render_rsp_hand
│   │
│   ├── tests/sim_test.c              # ★make test (acceptance test for the sim public API. 85 checks)
│   ├── minilibx-linux/               # vendored: MiniLibX
│   └── PythonCodes/                  # clint (custom C coding-rule linter) and migration scripts
├── web/                              # HTML/JS for the web target
│   ├── engine_demo.html / engine_demo.js         # local-play verification page (supports ?map= and ?res=)
│   ├── snapshot_interp.js            # interpolation between two snapshots (reused by F-06)
│   ├── bench_render.mjs              # per-resolution throughput measurement
│   ├── sim_demo/{record.mjs, replay.html, replay.js}  # one-way sim→JSON→render demo
│   └── build/ assets/                # generated output (not tracked by git)
├── app/{backend,frontend,shared}/    # web app (npm workspaces, added in W-01)
├── infra/                            # nginx, certificates, docker/ (W-15)
├── maps/                             # maps (fps_map/ and rsp_map/)
├── screenshot/                       # BMP output location for result screens (native only)
└── textures/                         # XPM assets (wall/object/enemy/hand/arm/interact/full...)
```

> **Note:** `t_game` is defined in `includes/types.h`, and pulls in each submodule's header (`config.h` / `raycast.h` / `render.h` / `enemy_types.h` / `rsp.h`). Enemy AI is not a single file — it is split by responsibility under `fps/enemy/`.

## 3. Enemy AI (Patrol, Sense, Pursue) — FPS Mode

Enemy AI runs as a single flow: **"sense every frame → patrol or pursue depending on state → move → update texture"**. Overall dispatch (mode routing) is handled by `enemy.c::update_enemies`, shared by both modes; in FPS mode it applies `fps_enemy_ai.c::update_fps_enemy` to each enemy, and in RSP mode `rsp_enemy_ai.c::update_rsp_enemy`.

### 3.1 State and Dispatch

State is represented by `t_enemy.state` (`t_enemy_state` in `enemy_types.h`) and the remaining pursuit time `t_enemy.track_timer`.

| State | Meaning |
|---|---|
| `ENEMY_STATE_IDLE` | idle (e.g. when unable to return to a patrol route) |
| `ENEMY_STATE_WALK` | pursuit (target detected and `track_timer > 0`) / movement in RSP |
| `ENEMY_STATE_DEAD` | defeated (actual removal is done by `damage_enemy`) |
| `ENEMY_STATE_PATROL` | patrol (circling on `P` cells, or returning to the nearest `P`) |

Dispatch is a one-liner in `move_enemy`:

```c
if (target && track_timer > 0.0) { track_timer -= dt; state = WALK; patrol_active = 0; track_target(target); }
else                             { patrol_enemy(); }
```

On detection, `track_timer` is reset to `enemy_track_seconds` (default 5 seconds, `.cub` key `ET`); even after losing sight of the target, pursuit continues until the remaining time runs out. If there is no seat to target (`target == NULL`), the enemy always patrols.

### 3.2 Sensing (`fps_enemy_sense.c::enemy_sees_target`)

Determined by a **3-condition AND** of distance, field of view, and line of sight. Following the 1vs1 change (G-08), the target is no longer fixed to the camera — it is **the "nearest living seat" returned by `nearest_seat`**. Because of this, the detection function takes coordinates as arguments.

1. **Distance**: invisible if `dist_pos(target, &sprite->pos) > ENEMY_SIGHT_RANGE(=100.0)` (a debug-purpose upper bound).
2. **Field of view (FOV)**: the strict check only applies when `track_timer <= 0.0` (i.e. not currently tracking). The difference between the target direction `target_angle` and the enemy's facing `dir_angle` is normalized to `(-π, π]` via `wrap_pi`; invisible if `|diff| > ENEMY_FOV_HALF(=π/8=±22.5°)`. **The FOV gate is removed while pursuing** (the enemy can keep tracking for a while even if the target circles behind it).
3. **Line of sight (LOS)**: `has_line_of_sight` samples from start point to end point in steps of `ENEMY_LOS_STEP(=0.05 tile)`; if an `IS_BLOCKING` cell lies in between, it is treated as occluded and invisible.

> **Sensing timing:** `update_fps_enemy` calls `enemy_sees_target` at the top of the loop **regardless of state**, then proceeds to `move_enemy → patrol_enemy → face_angle` (turning). Since `face_angle` rotates `dir_angle` (the FOV reference) every frame, the detection cone (±22.5°) sweeps along with the turning (with at most a one-frame phase lag).
>
> **Only the sprite's facing direction is camera-relative** (because the 8-direction texture is determined by "the angle relative to the viewer"). Separately from the pursuit target, `view_angle` is computed and passed to `update_texture`. If there is no seat to target (e.g. everyone is waiting to respawn), `track_timer` is dropped to 0 and the enemy returns to wandering.

### 3.3 Patrol (`enemy_patrol.c::patrol_enemy`)

Enemies circle over `P` cells (the `CELL_PATROL` flag) using the **right-hand rule**.

- **Currently on a `P` cell**: `seed_patrol` determines the initial direction; once within `ENEMY_PATROL_ARRIVE(=0.2)` of the arrival check, the next `P` cell is chosen (searched relative to the direction of arrival; dead ends reverse direction).
- **Currently off a `P` cell**: `bfs_to_nearest_patrol` (BFS) finds the next single tile toward the nearest `P` cell to return to. If no `P` cell is found, falls back to `ENEMY_STATE_IDLE`.
- **Turning (`face_angle`)**: closes the angle difference to the target direction at a turn-rate cap of `ENEMY_TURN_DEG_PER_SEC(=90°/sec)`, and **does not move forward while turning — it turns in place until facing is aligned**. Only on the frame where facing is aligned does it advance via `step_enemy`.

### 3.4 Pursuit (`fps_enemy_ai.c::track_target` / pathing in `enemy_path.c`)

- `ensure_path`: recomputes `bfs_fill_path` **only when the target seat's cell has changed or the cached path has been exhausted** (the cache is `t_enemy.path[PATH_MAX]`).
- `advance_path_index`: skips cells already reached to advance to the next index.
- `bfs_fill_path`: stores the shortest path (via 4-neighbor BFS) into `path[]` in forward order. If the path length exceeds `PATH_MAX(=1024)`, only the first `PATH_MAX` tiles from the start point are kept (behavior is unchanged; only the recompute frequency increases). On `malloc` failure, it safely `free`s and returns 0.

### 3.5 Movement (`enemy_move.c::step_enemy`)

Advances `enemy_speed × speed_mult × time_mult` in the `dir_angle` direction. **X-axis and Y-axis are attempted separately**, and each axis is applied only if `IN_MAP` / `!IS_BLOCKING` / `!is_blocked_by_entities` are all satisfied (this permits wall-sliding). In RSP mode, `speed_mult` is further multiplied by `RSP_ENEMY_SPEED_MULT(=0.3)`, giving a speed at which the player can both chase and escape. The collision radius is `ENEMY_RADIUS(=0.8)` (the player's is `PLAYER_RADIUS(=0.5)`).

## 4. RSP Mode (Rock-Paper-Scissors Tag)

This starts only when the map path is under `maps/fps_map/` / `maps/rsp_map/`; under `maps/rsp_map/`, `game->mode = MODE_RSP` and the game runs on **the same renderer, input, and physics**. The only difference from FPS is the game logic.

- **Initialization**: `finish_init` (`common/core/init.c`) calls `init_hand_textures` (6 hand images) and `setup_rsp_combatants` (combatant placement) when in RSP mode.
- **Every frame**: `update_enemies` applies `update_rsp_enemy` to each enemy, and contact resolution uses `resolve_rsp_combat` (RSP) instead of `check_enemy_contact` (FPS). `handle_action` returns immediately in any mode where `mode_ops.can_shoot == 0`, so in RSP mode weapon switching (`1`/`2`/`3`) and shooting are disabled.

### 4.1 Types and Pure Rules (`includes/rsp/`)

- **`rsp.h`** (types / pure rules. Does not depend on `t_game`, so it can be referenced from `common` too)
  - `t_team` (`TEAM_RED` / `TEAM_BLUE`), `t_hand` (`HAND_ROCK` / `HAND_SCISSORS` / `HAND_PAPER`), `t_rsp_result` (`RSP_DRAW` / `RSP_WIN` / `RSP_LOSE`)
  - `t_rsp_state`{`team`, `hand`, `spawn`, `alive`}
  - `HAND_SLOT(team, hand)` = `team * HAND_COUNT + hand` (defines the hand-texture array index in one place)
  - `rsp_outcome(a, b)`: uses the cyclic order of hands (Rock=0, Scissors=1, Paper=2) and determines the outcome with a single `(a - b + 3) % 3` modulo operation
  - `rsp_rehand(current, seed)`: returns a hand guaranteed to differ from the current one (uses the custom `ft_rand` for reproducibility)
- **`rsp_game.h`** (the gateway for the API that acts on `t_game`; kept separate from `rsp.h`, on which `common` depends, and included only from the fps/rsp side)
  - `init_hand_textures` / `setup_rsp_combatants` / `resolve_rsp_combat`
  - Constants `RSP_TEAM_SPAWNS=2`, `RSP_COMBATANTS=4`(=`TEAM_COUNT*RSP_TEAM_SPAWNS`), `RSP_RED_DIRS="NW"`, `RSP_BLUE_DIRS="SE"`

### 4.2 Implementation (`srcs/rsp/`)

| File | Role |
|---|---|
| `rsp_rule.c` | pure rules `rsp_outcome` / `rsp_rehand` (does not depend on `t_game`) |
| `rsp_assets.c` | `init_hand_textures`: loads 6 hand images in the order `team * HAND_COUNT + hand` |
| `rsp_setup.c` | `setup_rsp_combatants`: picks 2 non-overlapping points from N/W and 2 from S/E, places 4 combatants total, assigning one as the player and the rest as NPCs |
| `rsp_combat.c` | `resolve_rsp_combat`: resolves outcomes for all cross-team contact pairs every frame. The loser respawns immediately. Also handles `rsp_home_rehand`, which changes hands when stepping into home spawn (**iterates the list of external-input seats**, since the server may have multiple humans), and `rsp_target_score`, which returns the score needed to win |
| `rsp_enemy_ai.c` | `update_rsp_enemy`: looks at the nearest cross-team combatant — pursues if holding a winning hand, flees if holding a losing hand, wanders on a draw or if no target is present. Visually reflects the team×hand hand-texture every frame |
| `rsp_weapon.c` | `render_rsp_hand`: draws the own team×hand hand-texture at the bottom center of the screen (dispatched from the shared `draw_weapon` when in RSP mode) |

Each combatant's team, hand, initial respawn point, alive status, and home-entry detection (`on_home`) are embedded in `t_enemy.rsp` (`t_rsp_state`); only **world-shared information** (RNG state, score, winner, target score `target_score`) lives in `t_game.rsp`. There is no separate player-specific state (combatants are unified).

**The target score is configurable** (G-05). `rsp_target_score` returns `t_game.rsp.target_score` if it is 1 or greater, and the default `RSP_SCORE_LIMIT` (10) if it is 0 or less. The value is set only from `match_rules` in `game_create`; standalone native startup always uses the default. Validating the product-spec range (3–21) is the responsibility of the WS layer — the engine, as a mechanism, will run even a short match.

## 5. Key Types and Data Structures

> **Combatant unification (G-01–G-04)**: the player has no special type — it is **one node (`t_enemy`) in the `world.enemies` list**. `t_game.player` is a pointer to that node, and `t_game.camera` is "a rendering view derived every frame from the position and facing of one's own combatant." The only difference between AI and human is `input_source`; when a human disconnects, falling back to AI is done simply by reassigning it via `game_set_input_source`.

| Type | Role | Defined In |
|---|---|---|
| `t_game` | Facade bundling every subsystem (includes `mode` / `fps` / `rsp` / `player` / `camera` / `options`. **The death timer has been moved to the combatant side**) | `types.h` |
| `t_config` | resolution, colors, texture paths, map array, **cell attribute flag layer**, speed/FOV/enemy-track-seconds/enemy-speed/enemy-HP, spawn-point array | `config/config.h` |
| `t_window` | MiniLibX pointer, drawing back buffer | `render.h` |
| `t_camera` | position, view direction, camera plane, orthogonal vectors | `raycast.h` |
| `t_input` | pressed state per axis, currently equipped weapon, firing state | `types.h` |
| `t_world` | sprite list, enemy list, light list, collection progress | `types.h` |
| `t_assets` | texture sets for wall/floor/ceiling, weapon, enemy, **hand (RSP)**, door, and death screen | `types.h` |
| `t_render_cache` | `camera_x[MAX_WIDTH]` / `depth[MAX_WIDTH]` / `sf_dist[MAX_HEIGHT]` | `types.h` |
| `t_enemy` | **combatant** (shared by player, NPC, and hazard). HP, state, patrol state, pursuit path cache, `dir_angle`, `track_timer`, **`rsp`** (RSP state), plus items added by the unification: `input_source` (AI / EXTERNAL), buffered `input`, `is_player`, **`is_hazard`** (map-derived enemy `M`), **`combatant_id`** (seat number for the snapshot/public API; the local seat is 0, unassigned is -1), `radius`, **`death_timer`**, `spawn` (stable respawn point) | `enemy_types.h` |
| `t_rsp_state` | team / hand / spawn / alive / **`on_home`** (previous frame's home-entry value, used for hand-rehand decisions) | `rsp.h` |
| `t_match_rules` | match rules. `target_score` (used as-is if 1 or more; default `RSP_SCORE_LIMIT` if 0 or less) and `seed` (0 = time-derived / non-zero reproduces the whole match deterministically) | `platform/sim.h` |
| `t_sprite` | doubly-linked list for distance sorting (`next` and `sorted`) | `render.h` |
| `t_ray` | intermediate result of a single ray computation | `raycast.h` |

### `t_assets` Texture Slots (`types.h`)

`tex[TEXTURES]` (various wall/floor/ceiling/object textures) · `weapon_tex[WEAPON_TEX_COUNT]` · `enemy_tex[ENEMY_TEX_COUNT]` (8 directions) · `hand_tex[TEAM_COUNT * HAND_COUNT]` (the 6 RSP hand images) · `door_tex` · `death_tex`.

### Cell Attribute Flag Layer (`config/config.h`)

To protect static attributes from being overwritten in `map.data` by the visited marker `'A'` (the trail left by collected items), a separate layer called `map.flags` is maintained (built once at startup and immutable thereafter).

- `CELL_PATROL = (1 << 1)`: patrol-route `P` cell. Referenced via `FLAG_XY(x, y, c)`.
- Bit 0 is reserved for a future passability flag.

### Object Taxonomy (important)

Objects fall into **3 categories × up to 5 kinds each** (`config/config.h`).

- Map-character blocks: impassable `a`–`e` (`IMP_FIRST='a'`), passable `f`–`j` (`PAS_FIRST='f'`), collectible `k`–`o` (`COL_FIRST='k'`). `OBJ_PER_CATEGORY = 5`.
- Classification is via `IS_IMPASSABLE` / `IS_PASSABLE` / `IS_COLLECTIBLE`; collision checking uses `IS_BLOCKING` (`'1'`, a closed door `'D'`, or impassable).
- The map-character-to-texture-slot mapping is done arithmetically by `OBJ_SLOT(c)`, which maps to the consecutive `t_texture_id` values (`TEX_IMP_1..5` / `TEX_PAS_1..5` / `TEX_COL_1..5`).
- Door `'D'` (`DOOR_CHAR`) is treated as `IS_BLOCKING` (a wall) until collection is complete. `fps_item.c::open_doors` rewrites `'D'` → `'0'` to open it upon completion.
- The set of valid map characters is `VALID_MAP_CHARACTERS = " 01abcdefghijklmnoEWNSMPDG"` (`M` = enemy hazard, `P` = patrol route, `D` = door, **`G` = the FPS goal**. `2`/`3`/`4` are **not included**).
- The goal `'G'` (`GOAL_CHAR`) is passable, and **the combatant who steps on it first wins** (FPS 1vs1; `fps_item.c::reach_goal` records the `combatant_id` into `fps.winner`).

## 6. Per-Frame Data Flow

```
key_press / key_release ──► t_input                (native)
web_set_input                                       (web)
game_set_input / sim_set_input ──► per-seat t_input (headless = server)
                                │
                                ▼
  main_loop (native's time measurement) ──► game_frame ──► game_step(dt)
                  ├── update_death           ─► timer for every combatant → mode_ops.respawn when expired
                  ├── apply_input            ─► local seat only. Updates t_camera → writes back to the combatant
                  ├── step_external_combatants ─► applies input to external-input seats (human seats on the server)
                  ├── update_enemies         ─► AI seats only. FPS:[sense→patrol/pursue] / RSP:update_rsp_enemy
                  ├── mode_ops.combat        ─► FPS:check_enemy_contact (contact = death penalty)
                  │                             RSP:resolve_rsp_combat (rock-paper-scissors outcome → score)
                  └── check_quest            ─► feet of every combatant. goal reach / collection (open_doors on completion)
                                │
                                ▼
        game_frame ──► render_frame                (not linked in the sim build)
                       └── update_screen
                            ├── ray_cast per column → cache.depth[i]
                            ├── draw_wall / draw_sky_floor
                            ├── draw_sprites (sort_sprites)
                            ├── draw_weapon
                            ├── display_crosshair (FLAG_CROSSHAIR)
                            └── update_ui       (FLAG_UI)
                       ├── on cleared, draws the result screen, and save_result_screenshot only on the first such frame
                       │    (native only. excluded from the web build — G-10)
                       └── pf_present + write_ui_text
```

**In server-authoritative mode (`sim.wasm`), the rendering side of the diagram above does not exist at all.** The server runs `game_step` at 30Hz, and distributes the state returned by `game_snapshot` to clients. The client (`render.wasm`) writes the received snapshot into the display-side `t_game` via `game_apply_snapshot`, and simply draws it with `web_render_frame` (**there is no win/loss-judging code on the client**). For details, see [3-エンジンPhase3レポート](../03_実装レポート/3-エンジンPhase3レポート.md).

Rendering options are controlled by flags on `t_game.options` (`types.h`).

| Flag | Default / Control | Toggle |
|---|---|---|
| `FLAG_UI` | ON | `I` key |
| `FLAG_SHADOWS` | ON | `L` key |
| `FLAG_CROSSHAIR` | ON | `O` key |
| `FLAG_FLASHLIGHT` | Set into `rnd.options` from the weapon state at draw time (`screen.c`). Referenced by `light.c` / `color.c` | Tied to equipping the FPS flashlight (`2` key) |


## 7. Location of Tuning Values and Defaults

To avoid hardcoding, values are grouped by purpose.

### `tuning.h` (fixed at compile time; cannot be overridden at runtime)

| Category | Constant | Value | Purpose |
|---|---|---|---|
| Time | `TARGET_FPS` / `MAX_TIME_MULT` | 60.0 / 3.0 | Baseline and cap for the FPS-independent scale factor |
| Player speed | `PLAYER_RUN_BOOST` / `PLAYER_WALK_SPEED_MULT` / `PLAYER_RUN_SPEED_MULT` | 1.5 / 1.0 / (WALK×BOOST) | Multipliers for FPS bare-handed = walk mode (run is `RUN_BOOST` times walk) |
| Collision radius | `PLAYER_RADIUS` / `ENEMY_RADIUS` | 0.5 / 0.8 | Collision radius of the player / enemy |
| Wall margin | `WALL_MARGIN` | 0.4 | Center-stop margin to avoid clipping into walls |
| Contact | `RESPAWN_CONTACT_DIST` | 0.9 | Center-to-center distance treated as enemy contact (FPS) / rock-paper-scissors contact (RSP) |
| Death | `DEATH_DURATION` | 5.0 | Duration in seconds of the death presentation (full-screen death image) |
| Paths | `DEATH_TEX_PATH` / `DOOR_TEX_PATH` | Full_youdied / Interact_DOOR_3 | Paths to the death image / door texture |
| Enemy speed | `ENEMY_TRACK_BOOST` / `ENEMY_PATROL_SPEED_MULT` / `ENEMY_TRACK_SPEED_MULT` | 1.5 / 1.0 / (PATROL×BOOST) | Pursuit is `TRACK_BOOST` times patrol |
| RSP | `RSP_ENEMY_SPEED_MULT` | 0.3 | Common speed multiplier for RSP NPCs (applies to pursuing, fleeing, and wandering alike) |
| Patrol | `ENEMY_PATROL_ARRIVE` / `ENEMY_TURN_DEG_PER_SEC` | 0.2 / 90.0 | Arrival threshold / turn rate [degrees/sec] |
| Rendering | `BYTES_PER_PIXEL` | 4 | Invariant of the pixel format |
| Light | `LIGHT_CONE_DEG` / `LIGHT_RANGE` / `LIGHT_BOOST` | 20.0 / 50.0 / 1.5 | Flashlight half-angle / range / darkness-cancellation amount |
| Spot | `SPOT_RADIUS` / `SPOT_GAIN` | 4.0 / 4.0 | Spotlight radius / brightness gain for decorative sprites |

### `config/defaults.h` (defaults overridable via `.cub`)

| Constant | Value | `.cub` key |
|---|---|---|
| `DEFAULT_MOVE_SPEED` | 0.05 | `MS` |
| `DEFAULT_ROTATE_SPEED` | 0.05 | `RS` |
| `DEFAULT_FOV` | 0.66 | `FOV` |
| `DEFAULT_ENEMY_TRACK_SECONDS` | 5.0 | `ET` |
| `DEFAULT_ENEMY_SPEED` | 0.1 | `ES` |
| `DEFAULT_ENEMY_HP` | 5.0 | `EH` (number of hits required to defeat; treated as an integer) |

### Perception Constants Inside `fps_enemy_sense.c` (self-contained in that file)

`ENEMY_FOV_HALF(=π/8)` / `ENEMY_SIGHT_RANGE(=100.0)` / `ENEMY_LOS_STEP(=0.05)`. The field-of-view angle is aligned with the same angular width used for the "front-facing" display of the 8-direction sprites. `M_PI` is defined in `enemy_utils.h` and shared between perception and texture calculations.

## 8. Build

```
make           # native regular build (-O2 -Wall -Wextra -Werror -I codes/includes)
make web       # render.wasm (browser rendering) + texture conversion
make sim       # sim.wasm (server-authoritative sim. rendering symbols not linked)
make test      # acceptance test for the sim public API (links codes/tests/sim_test.c natively. 85 checks)
make debug     # rebuild with AddressSanitizer + debug symbols (-O0 -g3 -fsanitize=address)
make check     # runs the lint gates that must fail on violation, with --strict
make audit     # runs all lint checks, including advisory ones like magic numbers
make clean     # removes object files (codes/obj)
make fclean    # also removes the executable and test binaries
make re        # fclean + all
```

native compiles 3 source groups (`COMMON_SRCS` / `FPS_SRCS` / `RSP_SRCS`) plus `platform/native` into `codes/obj/` and links them. The `$(MLX_TARGET)` rule sub-makes `codes/minilibx-linux` (**the build requires `libbsd-dev`** — minilibx also builds `test/mlx-test`, and linking it requires `-lbsd`).

`web` / `sim` each use a single emcc command with a substituted source set; `sim` does **not link** the rendering side (draw routines, raycast, ui, bmp, weapon drawing). For header dependencies, native uses `-MMD -MP`, while web/sim list all headers plus the Makefile as prerequisites, so header changes propagate automatically either way.

> **`make test` does not require emcc** (it links `SIM_SRCS` directly with gcc), so it can run in CI without either X or Emscripten.

Use `make web` for web / WASM builds. The `Makefile` does not reference fixed paths like `~/emsdk` — it simply invokes `EMCC ?= emcc` — so the same target works whether Emscripten is installed locally or inside Docker. The recommended steps are:

```
docker compose up --build
# open http://localhost:8000/web/engine_demo.html
```

By default, Compose runs the container as root to avoid bind-mount permission errors right after a fresh clone. If you want generated files on Linux/WSL to be owned by yourself, specify the real UID/GID as in `HOST_UID=$(id -u) HOST_GID=$(id -g) docker compose up --build`.

### Coding Standards

The authoritative source for the C coding rules is [CODING_RULES.md](./コーディング規約.md). The `CRxxx` identifiers shown in `make check` output correspond to rule IDs in that document.

Review covers not just formatting but also granularity, high cohesion/low coupling, complexity, resource cleanup, and risk of undefined behavior. The 42 cub3D allowed-function constraints also apply (`open/close/read/write/printf/malloc/free/perror/strerror/exit/gettimeofday`, math functions, MiniLibX, and hand-written functions). The `pthread` family used by the parallel renderer is a deliberate exception.

### Bundled Lint Tools (`codes/PythonCodes/`)

```
make check                                  # lint gates that must fail on violation (WARN also counts as failure)
make audit                                  # all checks, including advisory ones
python3 codes/PythonCodes/lint.py --list     # list of available checks
python3 codes/PythonCodes/lint.py --fix      # inserts missing separators / comment templates
```

`make check` checks the mechanically-verifiable gate items from [CODING_RULES.md](./コーディング規約.md). `make audit` additionally shows advisory items such as magic numbers.

## 9. Result Screenshots

When a match reaches clear/win-loss determination, the result screen is automatically saved by `common/core/bmp.c::save_result_screenshot`. The save happens exactly once, on the first frame that draws the result screen.

> **native only (G-10).** The web build excludes the save path via `#ifndef WEB_BUILD` (writing to wasm's MEMFS would only be volatile), and the sim build does not link `bmp.c` / `screen.c` at all, so **file I/O structurally cannot occur**. For online match results, the DB (W-13) is the source of truth.

| Mode | Save Location |
|---|---|
| FPS | `./screenshot/fps_screen/fps_YYYYMMDD_HHMMSS_usec.bmp` |
| RSP | `./screenshot/rsp_screen/rsp_YYYYMMDD_HHMMSS_usec.bmp` |

The filename is converted to local date/time via `localtime()`, with microseconds appended at the end to avoid overwriting within the same second. There is no manual-save function, flag, or key binding — its use is limited to recording results.

## 10. Getting Started

```
git clone <repo>
cd ft_transcendence
sudo apt-get install gcc make xorg libxext-dev libbsd-dev   # native dependencies
make

# normal startup (FPS / RSP)
./cub3D maps/fps_map/1.cub
./cub3D maps/rsp_map/rsp.cub

# start with AddressSanitizer (recommended)
make debug
./cub3D maps/fps_map/1.cub

# checks
make check        # lint gates that must fail on violation (CRxxx)
make audit        # all lint checks, including advisory ones
make test         # acceptance test for the sim public API (85 checks. no emcc required)
```

### When Touching the wasm Side

```
make web sim                       # requires Emscripten (docker compose up --build also works)
python3 -m http.server 8000        # → http://localhost:8000/web/engine_demo.html
node web/sim_demo/record.mjs       # runs sim.wasm at 30Hz and writes snapshot JSON
                                   # → play it back at http://localhost:8000/web/sim_demo/replay.html
node web/bench_render.mjs          # per-internal-resolution throughput measurement
```

`engine_demo.html` lets you switch maps with `?map=rsp_map/rsp.cub` and the internal resolution with `?res=1280x720`.

### Web App (backend / frontend)

An npm-workspaces monorepo independent of the C engine. See the README for details.

```
npm install
npm run dev:backend    # Fastify :3000
npm run dev:frontend   # Vite :5173 (/api proxied to :3000)
npm run typecheck      # type-checks all 3 workspaces
```

> Under `web/`, a `package.json` with `{"type":"commonjs"}` is placed. Because the root has `"type": "module"`, without this, the CommonJS glue generated by emcc (`web/build/*.js`) is misidentified as ESM, and things like `record.mjs` fail to run.
