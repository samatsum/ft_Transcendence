# DEV_DOC — 開発者向けアーキテクチャ仕様書

このドキュメントは、cub3D エンジンを保守・拡張する開発者向けの技術資料です。記述内容は **実際のソースコードと一致するもののみ** を扱います。

---

## 1. 全体像

cub3D は MiniLibX（X11）上で動作する一人称 3D レンダラに、ゲームロジック（収集アイテム・扉・**巡回／追跡する敵 AI**・武器切替）を載せたものです。同じエンジン上で、`maps/rsp_map/` 配下のマップを指定すると **じゃんけん鬼ごっこ（RSP モード）** が動きます。

レンダリングはレイキャスティング（DDA）と、画面を縦 1 列ずつ走査して壁・床・天井・スプライトを描く古典的な手法を用います。

ライフサイクルは以下のとおりです（`codes/srcs/common/main.c`）。

```
main()
  └── validate_check() : 引数チェック + マップパスから mode 決定 + init_config + .cub のパース (parse_config)
  │                      maps/fps_map/ / maps/rsp_map/ で game->mode を決定
  └── setup_inits()    : init_game + finish_init
  │                      （ウィンドウ生成、テクスチャ読込、スプライト/敵リスト構築、
  │                        収集数カウント、セル属性フラグ層の構築、事前計算テーブル生成。
  │                        RSP 時はハンドテクスチャ読込と戦闘員配置も実施）
  └── setup_hooks()    : X11 イベントとループフックの登録 (mlx_hook / mlx_loop_hook)
  └── mlx_loop()       : 以後 main_loop() が毎フレーム呼ばれる
```

毎フレーム（`main_loop`, `codes/srcs/common/core/loop.c`）では以下が走ります。

1. 経過時間から `time_mult` を算出（60 FPS 基準のスケール係数、上限 3.0 / `tuning.h` の `TARGET_FPS`・`MAX_TIME_MULT`）。FPS 上限未達のフレームは即 return（許可関数に sleep が無いためビジーウェイト）
2. 死亡中はタイマーのみ進める。生存中は入力に応じた移動・回転（`camera.c`）とアイテム取得判定 `check_quest`
3. 敵 AI 更新 `update_enemies`（モードで分岐。FPS は索敵→巡回/追跡、RSP はじゃんけん AI。詳細は §3 / §4）
4. 接触判定：FPS は `check_enemy_contact`（敵に触れると死亡演出）、RSP は `resolve_rsp_combat`（じゃんけん勝敗）
5. `render_frame` → `update_screen` → `mlx_put_image_to_window`

## 2. ディレクトリ構成（実態）

ソースは **`common`（両モード共通）/ `fps`（FPS 固有）/ `rsp`（RSP 固有）** の 3 系統に分かれ、公開ヘッダは `codes/includes/` に集約されています（`-I codes/includes`）。

```
samatsum-cub3D/
├── Makefile                          # COMMON_SRCS / FPS_SRCS / RSP_SRCS の 3 系統をビルド
├── README.md / md_files/{INDEX.md, cub3d/, design/, subject/, reports/}
├── codes/
│   ├── includes/                     # 公開ヘッダ
│   │   ├── types.h                   # t_game ファサード、描画フラグ、入力/世界/資産/キャッシュ型
│   │   ├── tuning.h                  # コンパイル時固定の調整値・仕様定数
│   │   ├── config/{config.h, defaults.h}
│   │   ├── core/{core.h, respawn.h, collision.h}
│   │   ├── engine/
│   │   │   ├── input/{input.h, keymap.h}
│   │   │   ├── raycast/raycast.h     # t_camera, t_ray
│   │   │   ├── render/{render.h, light.h}
│   │   │   └── texture/texture.h
│   │   ├── enemy/{enemy.h, enemy_types.h, enemy_utils.h}
│   │   ├── rsp/{rsp.h, rsp_game.h}   # RSP の型・純粋ルール / t_game に作用する API
│   │   ├── gnl/get_next_line.h
│   │   ├── ui/{ui.h, font.h}
│   │   └── utils/utils.h
│   │
│   ├── srcs/
│   │   ├── common/                   # エンジン ＋ 司令塔/ディスパッチャ（両モード共通）
│   │   │   ├── main.c                # エントリポイント（マップパスから FPS/RSP mode を決定）
│   │   │   ├── config/               # .cub のパースと検証
│   │   │   │   ├── config.c          # init/clear、キー対応表 g_keys[]、parse 全体の制御
│   │   │   │   ├── parse_map.c       # マップ本体 → int 配列、P セルの CELL_PATROL 付与
│   │   │   │   ├── check_map.c       # 境界・列数・文字種（VALID_MAP_CHARACTERS）チェック
│   │   │   │   ├── parse_params.c    # R / F / C とスカラー(MS/RS/FOV/ET/ES/EH)。g_scalars[]
│   │   │   │   └── parse_texture.c   # NO/SO/WE/EA/ST/FT と OI1..5 / OP1..5 / OC1..5
│   │   │   ├── core/                 # ループ/初期化/終了の司令塔（中の mode 分岐は呼ぶだけ）
│   │   │   │   ├── loop.c            # main_loop（毎フレームの司令塔・mode 振り分け）
│   │   │   │   ├── init.c            # finish_init（RSP 時はハンド読込・戦闘員配置も）
│   │   │   │   ├── exit.c            # 全リソース解放
│   │   │   │   └── collision.c, bmp.c
│   │   │   ├── engine/
│   │   │   │   ├── input/input.c     # X11 キーフック（WASD + 矢印 + FPS専用の1/2/3/Space + I/L/O/Esc）
│   │   │   │   ├── raycast/{raycast.c, camera.c, spawn.c, spawn_marker.c}
│   │   │   │   ├── render/{screen.c, draw.c, draw_wall.c, draw_sky_floor.c, sprite.c,
│   │   │   │   │           sprite_utils.c, cast_columns.c, light.c, tables.c,
│   │   │   │   │           draw_weapon.c}  # draw_weapon=武器描画の振り分け＋共通 draw_overlay
│   │   │   │   └── texture/{texture.c, color.c}
│   │   │   ├── enemy/{enemy.c, enemy_path.c, enemy_move.c, enemy_patrol.c}  # 敵リスト管理＋探索/移動/巡回（両モード共通）
│   │   │   ├── gnl/{get_next_line.c, get_next_line_utils.c}
│   │   │   ├── ui/{font.c, ui.c, crosshair.c}  # 文字描画・ミニマップ・照準（両モード）
│   │   │   └── utils/                # libft 相当の自作ユーティリティ（pos.c に set/copy/dist_pos）
│   │   │
│   │   ├── fps/                      # FPS モード固有の実装（core/enemy/render の3層）
│   │   │   ├── core/{fps_shoot.c, fps_item.c, fps_respawn.c, fps_mode.c, fps_assets.c}
│   │   │   ├── enemy/{fps_enemy_ai.c, fps_enemy_assets.c, fps_enemy_sense.c}  # 索敵/追跡 AI・敵テクスチャ
│   │   │   └── render/fps_weapon.c   # 素手/武器(ピストル・ライト)のオーバーレイ描画
│   │   │
│   │   └── rsp/                      # RSP モード固有の実装（core/enemy/render の3層。§4）
│   │       ├── core/{rsp_mode.c, rsp_setup.c, rsp_assets.c, rsp_rule.c, rsp_combat.c}
│   │       ├── enemy/rsp_enemy_ai.c  # NPC AI update_rsp_enemy
│   │       └── render/rsp_weapon.c   # じゃんけんの手のオーバーレイ描画 render_rsp_hand
│   │
│   ├── minilibx-linux/               # ベンダー: MiniLibX
│   └── PythonCodes/                  # clint（独自 C コーディングルール linter）と移行スクリプト
├── maps/                             # テスト用マップ（fps_map/ と rsp_map/）
├── screenshot/                       # 結果画面の BMP 保存先（fps_screen/ と rsp_screen/）
└── textures/                         # XPM アセット（wall/object/enemy/hand/arm/interact/full…）
```

> **注:** `t_game` の定義は `includes/types.h` にあり、各サブモジュールのヘッダ（`config.h` / `raycast.h` / `render.h` / `enemy_types.h` / `rsp.h`）を取り込みます。敵 AI は単一ファイルではなく、責務ごとに `fps/enemy/` 配下へ分割されています。

## 3. 敵 AI（巡回・索敵・追跡）— FPS モード

敵 AI は **「毎フレーム索敵 → 状態に応じて巡回 or 追跡 → 移動 → テクスチャ更新」** という一本の流れで動きます。統括（mode 振り分け）は両モード共通の `enemy.c::update_enemies` で、FPS 時は各敵に `fps_enemy_ai.c::update_fps_enemy`、RSP 時は `rsp_enemy_ai.c::update_rsp_enemy` を適用します。

### 3.1 状態と振り分け

状態は `t_enemy.state`（`enemy_types.h` の `t_enemy_state`）と、追跡残時間 `t_enemy.track_timer` で表現します。

| 状態 | 意味 |
|---|---|
| `ENEMY_STATE_IDLE` | 待機（巡回路へ復帰できないとき等） |
| `ENEMY_STATE_WALK` | 追跡（プレイヤーを検知済みで `track_timer > 0`）／RSP の移動 |
| `ENEMY_STATE_DEAD` | 撃破（実際の除去は `damage_enemy`） |
| `ENEMY_STATE_PATROL` | 巡回（`P` セル上を周回、または最近接 `P` へ復帰中） |

振り分けは `move_enemy` がワンライナーで行います。

```c
if (track_timer > 0.0) { track_timer -= dt; state = WALK; patrol_active = 0; track_player(); }
else                   { patrol_enemy(); }
```

検知すると `track_timer` が `enemy_track_seconds`（既定 5 秒・`.cub` の `ET`）にリセットされ、見失っても残時間が尽きるまでは追跡を継続します。

### 3.2 索敵（`fps_enemy_sense.c::enemy_sees_player`）

距離・視野角・視線の **3 条件 AND** で判定します。

1. **距離**：`dist_pos(&camera.pos, &sprite->pos) > ENEMY_SIGHT_RANGE(=100.0)` なら不可視（デバッグ用上限）。
2. **視野角（FOV）**：`track_timer <= 0.0`（＝未追跡）のときのみ厳密チェック。プレイヤー方向 `target_angle` と敵の向き `dir_angle` の差を `wrap_pi` で `(-π, π]` に正規化し、`|diff| > ENEMY_FOV_HALF(=π/8=±22.5°)` なら不可視。**追跡中は視野角ゲートを外す**（背後に回り込まれても一定時間は追える）。
3. **視線（LOS）**：`has_line_of_sight` が始点→終点を `ENEMY_LOS_STEP(=0.05 マス)` 刻みでサンプリングし、`IS_BLOCKING` セルが間にあれば遮蔽として不可視。

> **索敵タイミング:** `update_fps_enemy` はループ先頭で **状態に関係なく** `enemy_sees_player` を呼び、その後 `move_enemy → patrol_enemy → face_angle`（回頭）に進みます。FOV 判定の基準 `dir_angle` は `face_angle` が毎フレーム旋回させるため、検知コーン（±22.5°）は回頭に追従してスイープします（最大 1 フレームの位相遅れ）。

### 3.3 巡回（`enemy_patrol.c::patrol_enemy`）

`P` セル（`CELL_PATROL` フラグ）の上を、**右手法則**で周回します。

- **現在地が `P` 上**：`seed_patrol` で初期方向を決定し、到達判定 `ENEMY_PATROL_ARRIVE(=0.2)` 以内に入ったら次の `P` セルを選ぶ（来た方向を基準に探索、行き止まりは反転）。
- **現在地が `P` 外**：`bfs_to_nearest_patrol`（BFS）で最近接 `P` への次の 1 マスを求めて復帰。`P` が見つからなければ `ENEMY_STATE_IDLE`。
- **回頭（`face_angle`）**：目標方向との角度差を旋回速度上限 `ENEMY_TURN_DEG_PER_SEC(=90°/秒)` で詰め、**向きが揃うまでは前進せずその場で旋回**。揃ったフレームだけ `step_enemy` で前進します。

### 3.4 追跡（`fps_enemy_ai.c::track_player` / 経路 `enemy_path.c`）

- `ensure_path`：プレイヤーの**セルが変わったか経路を使い切ったときだけ** `bfs_fill_path` を再計算（キャッシュは `t_enemy.path[PATH_MAX]`）。
- `advance_path_index`：既に到達したセルを読み飛ばして次の添字へ。
- `bfs_fill_path`：4 近傍 BFS で最短経路を `path[]` に前方順で格納。経路長が `PATH_MAX(=1024)` を超える場合は始点側の先頭 `PATH_MAX` マスのみ保持（挙動は不変、再計算頻度のみ増）。`malloc` 失敗時は安全に `free` して 0 を返します。

### 3.5 移動（`enemy_move.c::step_enemy`）

`dir_angle` 方向へ `enemy_speed × speed_mult × time_mult` だけ前進。**X 軸・Y 軸を分離**して試行し、各軸ごとに `IN_MAP` / `!IS_BLOCKING` / `!is_blocked_by_entities` を満たす場合のみ反映（壁ずりが可能）。RSP モードでは `speed_mult` にさらに `RSP_ENEMY_SPEED_MULT(=0.3)` が掛かり、プレイヤーが追える／逃げられる速度になります。当たり半径は `ENEMY_RADIUS(=0.8)`（プレイヤーは `PLAYER_RADIUS(=0.5)`）。

## 4. RSP モード（じゃんけん鬼ごっこ）

マップパスが `maps/fps_map/` / `maps/rsp_map/` のときだけ起動し、`maps/rsp_map/` では `game->mode = MODE_RSP` となり、**同じレンダラ・入力・物理の上で** 動きます。FPS との差分はゲームロジックのみです。

- **初期化**：`finish_init`（`common/core/init.c`）が RSP 時に `init_hand_textures`（ハンド画像 6 枚）と `setup_rsp_combatants`（戦闘員配置）を呼びます。
- **毎フレーム**：`update_enemies` が各敵に `update_rsp_enemy` を適用し、接触判定を `check_enemy_contact`（FPS）ではなく `resolve_rsp_combat`（RSP）で行います。`handle_action` は `mode_ops.can_shoot == 0` のモードで即 return し、RSP では `1`/`2`/`3` の武器切り替えと射撃を無効化します。

### 4.1 型と純粋ルール（`includes/rsp/`）

- **`rsp.h`**（型・純粋ルール。`t_game` 非依存で common からも参照可）
  - `t_team`（`TEAM_RED` / `TEAM_BLUE`）, `t_hand`（`HAND_ROCK` / `HAND_SCISSORS` / `HAND_PAPER`）, `t_rsp_result`（`RSP_DRAW` / `RSP_WIN` / `RSP_LOSE`）
  - `t_rsp_state`{`team`, `hand`, `spawn`, `alive`}
  - `HAND_SLOT(team, hand)` = `team * HAND_COUNT + hand`（ハンドテクスチャ配列の添字を 1 箇所で定義）
  - `rsp_outcome(a, b)`：手の循環順（Rock=0,Scissors=1,Paper=2）を利用し、勝敗を `(a - b + 3) % 3` の剰余演算 1 本で判定
  - `rsp_rehand(current, seed)`：今と必ず違う手を返す（自作 `ft_rand` で再現性確保）
- **`rsp_game.h`**（`t_game` に作用する API の窓口。common が依存する `rsp.h` と分け、fps/rsp 側からのみ include）
  - `init_hand_textures` / `setup_rsp_combatants` / `resolve_rsp_combat`
  - 定数 `RSP_TEAM_SPAWNS=2`, `RSP_COMBATANTS=4`(=`TEAM_COUNT*RSP_TEAM_SPAWNS`), `RSP_RED_DIRS="NW"`, `RSP_BLUE_DIRS="SE"`

### 4.2 実装（`srcs/rsp/`）

| ファイル | 役割 |
|---|---|
| `rsp_rule.c` | 純粋ルール `rsp_outcome` / `rsp_rehand`（`t_game` 非依存） |
| `rsp_assets.c` | `init_hand_textures`：`team * HAND_COUNT + hand` の並びでハンド画像 6 枚を読込 |
| `rsp_setup.c` | `setup_rsp_combatants`：N/W から 2 地点・S/E から 2 地点を重複なく選び、4 人のうち 1 人をプレイヤー・残りを NPC として配置 |
| `rsp_combat.c` | `resolve_rsp_combat`：毎フレーム全異チームペアの接触を勝敗解決。負けた側を即リスポーン。自陣スポーンへの踏み込みで手を変える `rsp_home_rehand` も担当 |
| `rsp_enemy_ai.c` | `update_rsp_enemy`：最寄りの異チーム戦闘員を見て、勝てる手なら追跡・負ける手なら逃走・あいこや相手不在は徘徊。見た目は team×手のハンドテクスチャを毎フレーム反映 |
| `rsp_weapon.c` | `render_rsp_hand`：自分のチーム×手のハンドテクスチャを画面下部中央へ描画（共通の `draw_weapon` から RSP 時に振り分けられる） |

各 NPC のチーム・手・初期リスポーン地点・生存は `t_enemy.rsp`（`t_rsp_state`）に埋め込み、プレイヤー状態・乱数状態・スコア・勝者・自陣踏み込み検出は `t_game.rsp` にまとめています。

## 5. 主要な型とデータ構造

| 型 | 役割 | 定義場所 |
|---|---|---|
| `t_game` | すべてのサブシステムを束ねるファサード（`mode` / `fps` / `rsp` / `death_timer` / `options` を含む） | `types.h` |
| `t_config` | 解像度・色・テクスチャパス・マップ配列・**セル属性フラグ層**・速度/FOV/敵追跡秒/敵速度/敵HP・スポーン地点配列 | `config/config.h` |
| `t_window` | MiniLibX のポインタ、描画用バックバッファ | `render.h` |
| `t_camera` | 位置・視線・カメラ平面・直交ベクトル | `raycast.h` |
| `t_input` | 各軸の押下状態と装備中の武器・射撃状態 | `types.h` |
| `t_world` | スプライトリストと敵リスト、ライトリスト、収集進捗 | `types.h` |
| `t_assets` | 壁/床/天井・武器・敵・**ハンド(RSP)**・扉・死亡画面のテクスチャ群 | `types.h` |
| `t_render_cache` | `camera_x[MAX_WIDTH]` / `depth[MAX_WIDTH]` / `sf_dist[MAX_HEIGHT]` | `types.h` |
| `t_enemy` | HP・状態・巡回状態・追跡経路キャッシュ・`dir_angle`・`track_timer`・**`rsp`（RSP 状態）** | `enemy_types.h` |
| `t_rsp_state` | team / hand / spawn / alive（プレイヤーと各 NPC が 1 つずつ持つ） | `rsp.h` |
| `t_sprite` | 距離ソート用の双リンク（`next` と `sorted`） | `render.h` |
| `t_ray` | 1 本のレイの計算中間結果 | `raycast.h` |

### `t_assets` のテクスチャ枠（`types.h`）

`tex[TEXTURES]`（壁/床/天井/オブジェクト各種）・`weapon_tex[WEAPON_TEX_COUNT]`・`enemy_tex[ENEMY_TEX_COUNT]`（8 方向）・`hand_tex[TEAM_COUNT * HAND_COUNT]`（RSP の 6 枚）・`door_tex`・`death_tex`。

### セル属性フラグ層（`config/config.h`）

訪問済みマーカー `'A'`（収集済みアイテムの跡）による `map.data` 上書きから静的属性を守るため、`map.flags` という別レイヤを持ちます（起動時に一度だけ構築し以後不変）。

- `CELL_PATROL = (1 << 1)`：巡回路 `P` セル。`FLAG_XY(x, y, c)` で参照。
- ビット 0 は将来の通行可フラグ用に予約。

### オブジェクト体系（重要）

オブジェクトは **3 カテゴリ × 最大 5 種** です（`config/config.h`）。

- マップ文字ブロック：通行不可 `a`〜`e`（`IMP_FIRST='a'`）、通行可 `f`〜`j`（`PAS_FIRST='f'`）、収集 `k`〜`o`（`COL_FIRST='k'`）。`OBJ_PER_CATEGORY = 5`。
- 分類は `IS_IMPASSABLE` / `IS_PASSABLE` / `IS_COLLECTIBLE`、当たり判定は `IS_BLOCKING`（`'1'`・閉じた扉 `'D'`・通行不可）で行います。
- マップ文字 → テクスチャスロットは `OBJ_SLOT(c)` が連番の `t_texture_id`（`TEX_IMP_1..5` / `TEX_PAS_1..5` / `TEX_COL_1..5`）を算術で引きます。
- 扉 `'D'`（`DOOR_CHAR`）は収集完了まで `IS_BLOCKING` で壁扱い。`fps_item.c::open_doors` が完了時に `'D'`→`'0'` へ書き換えて開放します。
- 有効マップ文字集合は `VALID_MAP_CHARACTERS = " 01abcdefghijklmnoEWNSMPD"`（`M`=敵、`P`=巡回路、`D`=扉。`2`/`3`/`4` は **含まれない**）。

## 6. フレームのデータフロー

```
key_press / key_release ──► t_input
                                │
                                ▼
        main_loop ──► (入力適用) ──► t_camera 更新
                  ──► check_quest  ──► t_world.collected（完了で open_doors）
                  ──► update_enemies ─► FPS: [索敵→巡回/追跡]  /  RSP: update_rsp_enemy
                  ──► (接触) ─► FPS: check_enemy_contact  /  RSP: resolve_rsp_combat
                  ──► render_frame
                       └── update_screen
                            ├── 列ごとに ray_cast → cache.depth[i]
                            ├── draw_wall / draw_sky_floor
                            ├── draw_sprites (sort_sprites)
                            ├── draw_weapon
                            ├── display_crosshair (FLAG_CROSSHAIR)
                            └── update_ui       (FLAG_UI)
                       ├── cleared 時は結果画面を描画し、初回だけ save_result_screenshot
                       └── mlx_put_image_to_window + write_ui_text
```

描画オプションは `t_game.options` のフラグで制御します（`types.h`）。

| フラグ | 既定 / 制御 | 切替 |
|---|---|---|
| `FLAG_UI` | ON | `I` キー |
| `FLAG_SHADOWS` | ON | `L` キー |
| `FLAG_CROSSHAIR` | ON | `O` キー |
| `FLAG_FLASHLIGHT` | 描画時に武器状態から `rnd.options` へ設定（`screen.c`）。`light.c` / `color.c` が参照 | FPS のフラッシュライト装備（`2` キー）に連動 |


## 7. チューニング値・既定値の所在

直書きを避け、用途で分けて集約しています。

### `tuning.h`（コンパイル時固定。実行時の上書き不可）

| 区分 | 定数 | 値 | 用途 |
|---|---|---|---|
| 時間 | `TARGET_FPS` / `MAX_TIME_MULT` | 60.0 / 3.0 | FPS 非依存スケール係数の基準と上限 |
| プレイヤー速度 | `PLAYER_RUN_BOOST` / `PLAYER_WALK_SPEED_MULT` / `PLAYER_RUN_SPEED_MULT` | 1.5 / 1.0 / (WALK×BOOST) | FPS の素手＝走行モードの倍率（走行は歩行の `RUN_BOOST` 倍） |
| 当たり半径 | `PLAYER_RADIUS` / `ENEMY_RADIUS` | 0.5 / 0.8 | プレイヤー／敵の当たり半径 |
| 壁マージン | `WALL_MARGIN` | 0.4 | 壁へ食い込まないための中心停止マージン |
| 接触 | `RESPAWN_CONTACT_DIST` | 0.9 | 敵接触（FPS）／じゃんけん接触（RSP）とみなす中心間距離 |
| 死亡 | `DEATH_DURATION` | 5.0 | 死亡演出（全画面死亡画像）の秒数 |
| パス | `DEATH_TEX_PATH` / `DOOR_TEX_PATH` | Full_youdied / Interact_DOOR_3 | 死亡画像・扉テクスチャのパス |
| 敵速度 | `ENEMY_TRACK_BOOST` / `ENEMY_PATROL_SPEED_MULT` / `ENEMY_TRACK_SPEED_MULT` | 1.5 / 1.0 / (PATROL×BOOST) | 追跡は巡回の `TRACK_BOOST` 倍 |
| RSP | `RSP_ENEMY_SPEED_MULT` | 0.3 | RSP の NPC 共通速度係数（追跡・逃走・徘徊すべてに掛かる） |
| 巡回 | `ENEMY_PATROL_ARRIVE` / `ENEMY_TURN_DEG_PER_SEC` | 0.2 / 90.0 | 到達判定しきい値・回頭速度[度/秒] |
| 描画 | `BYTES_PER_PIXEL` | 4 | フォーマット上の不変条件 |
| ライト | `LIGHT_CONE_DEG` / `LIGHT_RANGE` / `LIGHT_BOOST` | 20.0 / 50.0 / 1.5 | フラッシュライトの半角・距離・暗化打消量 |
| スポット | `SPOT_RADIUS` / `SPOT_GAIN` | 4.0 / 4.0 | 装飾スプライトのスポットライト半径・明度ゲイン |

### `config/defaults.h`（`.cub` で上書き可能な既定値）

| 定数 | 値 | `.cub` キー |
|---|---|---|
| `DEFAULT_MOVE_SPEED` | 0.05 | `MS` |
| `DEFAULT_ROTATE_SPEED` | 0.05 | `RS` |
| `DEFAULT_FOV` | 0.66 | `FOV` |
| `DEFAULT_ENEMY_TRACK_SECONDS` | 5.0 | `ET` |
| `DEFAULT_ENEMY_SPEED` | 0.1 | `ES` |
| `DEFAULT_ENEMY_HP` | 5.0 | `EH`（撃破に要するヒット数。整数として扱う） |

### `fps_enemy_sense.c` 内の知覚定数（同ファイル完結）

`ENEMY_FOV_HALF(=π/8)` / `ENEMY_SIGHT_RANGE(=100.0)` / `ENEMY_LOS_STEP(=0.05)`。視野角は 8 方向スプライトの「正面」表示と同じ画角に揃えています。`M_PI` は `enemy_utils.h` で定義し、知覚・テクスチャ算出で共有します。

## 8. ビルド

```
make           # 通常ビルド（-O2 -Wall -Wextra -Werror -I codes/includes）
make debug     # AddressSanitizer + デバッグシンボル（-O0 -g3 -fsanitize=address）で再ビルド
make check     # 失敗すべき lint ゲートを --strict で実行
make audit     # magic number など助言系を含めた全 lint を実行
make clean     # オブジェクト（codes/obj）の削除
make fclean    # 実行ファイルも含めて削除
make re        # fclean + all
```

ビルドは 3 系統（`COMMON_SRCS` / `FPS_SRCS` / `RSP_SRCS`）をそれぞれ `codes/obj/{common,fps,rsp}/` へコンパイルしてリンクします。`$(MLX_TARGET)` ルールは `codes/minilibx-linux` をサブ make します。

### コーディング規約

C コーディングルールの正本は [CODING_RULES.md](./CODING_RULES.md) です。`make check` の出力に表示される `CRxxx` は、この文書のルール ID に対応します。

レビューではフォーマットだけでなく、粒度、高凝集・低結合、複雑度、リソース解放、未定義動作の危険性も確認します。42 cub3D の許可関数制約（`open/close/read/write/printf/malloc/free/perror/strerror/exit/gettimeofday`、math、MiniLibX、自作関数）も前提です。並列レンダラの `pthread` 系は意図的な例外です。

### 付属の lint ツール（`codes/PythonCodes/`）

```
make check                                  # 失敗すべき lint ゲート（WARN も失敗）
make audit                                  # 助言系を含む全検査
python3 codes/PythonCodes/lint.py --list     # 利用可能な検査の一覧
python3 codes/PythonCodes/lint.py --fix      # 不足セパレータ/コメント雛形を挿入
```

`make check` は [CODING_RULES.md](./CODING_RULES.md) のうち機械判定しやすいゲート項目を検査します。`make audit` はそれに加えてマジックナンバーなど助言系も表示します。

## 9. 結果スクリーンショット

クリア/勝敗が確定した結果画面は、`common/core/bmp.c::save_result_screenshot` で自動保存します。保存は結果画面を描画した最初のフレームで 1 回だけ行います。

| モード | 保存先 |
|---|---|
| FPS | `./screenshot/fps_screen/fps_YYYYMMDD_HHMMSS_usec.bmp` |
| RSP | `./screenshot/rsp_screen/rsp_YYYYMMDD_HHMMSS_usec.bmp` |

ファイル名は `localtime()` でローカル日時に変換し、末尾にマイクロ秒を付けて同一秒内の上書きを避けます。手動保存用の関数・フラグ・キーバインドは持たず、結果記録に用途を絞ります。

## 10. 開発の始め方

```
git clone <repo>
cd samatsum-cub3D
make

# 通常起動（FPS / RSP）
./cub3D maps/fps_map/1.cub
./cub3D maps/rsp_map/rsp.cub

# AddressSanitizer 付きで起動（推奨）
make debug
./cub3D maps/fps_map/1.cub

# コーディングルール検査
make check        # 失敗すべき lint ゲート
make audit        # 助言系を含む全 lint
```
