# ENGINE_SEPARATION_DESIGN — cub3D エンジン分離 詳細設計書

**位置づけ**: [ARCHITECTURE_DESIGN.md](./ARCHITECTURE_DESIGN.md) §2.1〜2.2 の詳細化。壱（Engine）の Day 1〜5 と肆（Gameplay）の Day 4〜9 の作業指示書に相当する。
**原則**: ネイティブ版（MiniLibX/X11）を**常に動く状態に保ちながら**段階的に分離する。本書は実装コードを含まない（インターフェース仕様と受入条件のみ）。

---

## 0. 前提（コード実査の結果）

- **最新 HEAD（ルートの `codes/srcs/{common,fps,rsp}`）で検証済み**。`t_game` は `t_fps_data fps` / `t_rsp_data rsp` のモード別集約 + `t_mode_ops` ディスパッチを持つ DEV_DOC 記載どおりの構成であることをソースで確認した。
- 実査で確認した「分離に有利な事実」:

| 事実 | 分離への含意 |
|---|---|
| `draw_pixel` は `t_window.screen.ptr`（ピクセルバッファ）へ直書きするインライン関数 | 描画系は**既にフレームバッファ指向**。MLXへの依存は「バッファの入手」と「画面転送」の2点だけ |
| MLX API 呼び出し箇所は 6 ファイルに集中（下表） | 置換対象が狭い。散在していない |
| 文字描画は自作 `font.c`（`mlx_string_put` 不使用） | UI 描画はそのまま移植可能 |
| 入力は `g_hold_keys[]`（X11キーコード→論理軸 `t_axis`）のテーブル変換 | 論理軸 `AXIS_*` を境界にすれば入力抽象は完成済みに近い |
| `t_render` は `t_game` から必要参照だけを束ねた構造体で描画する | 描画層の引数は既に整理済み。`t_game` 依存の切断が容易 |
| 時間は `gettimeofday`、FPS制限は `usleep` によるアイドル | 時間・スリープはプラットフォーム層の2関数に置換可能 |
| 並列レンダラ（`t_render_job` + pthread）は列分割で mutex 不使用 | WASM 初期ビルドでは**無効化**（単一スレッド化）が容易な構造 |
| `t_mode_ops`（init_assets/combat/update_enemy/draw_weapon 等の関数テーブル） | モード分岐が既に間接呼び出し化されており、入力源抽象（§3-C）も同じパターンで足せる |
| **RSP のチームスコア・先取制・勝者判定は実装済み**（`award_rsp_point` / `RSP_SCORE_LIMIT` / `rsp.winner`、スコアUI表示あり） | G-05 は「先取点数の `match_rules` 化（可変化）」のみに縮小 |
| **FPS のゴールは実装済み**（`IS_GOAL` セル + `clear_goal` + `goal_tex`） | G-06 は「1vs1 化と勝者帰属」のみに縮小。マップ文字 `G` の新設は不要 |

### MLX/OS 依存の棚卸し（置換対象の全リスト）

| ファイル | 使用 API | 用途 | 移行先 |
|---|---|---|---|
| `main.c`（司令塔） | `mlx_init` / `mlx_new_window` / `mlx_hook`×4 / `mlx_loop_hook` / `mlx_loop` | 起動・イベント登録・ループ駆動 | プラットフォーム層（web は `requestAnimationFrame` / サーバは tick） |
| `core/init.c` | `mlx_new_image` / `mlx_get_data_addr` / `mlx_xpm_file_to_image` | バックバッファ生成・テクスチャ読込 | `pf_create_framebuffer` / `pf_load_texture` |
| `srcs/common/engine/texture/texture.c` | `mlx_xpm_file_to_image` / `mlx_get_data_addr` / `mlx_destroy_image` | **全テクスチャ読込の集約点**（`load_one_tex`。敵8方向・ハンド6枚・ゴール等のモード別アセットもここを経由し、`fps/`・`rsp/` 配下に mlx 直呼びは存在しない） | 同上 |
| `engine/render/screen.c` | `mlx_put_image_to_window` | バックバッファの画面転送 | `pf_present` |
| `core/exit.c` | `mlx_destroy_image` / `mlx_destroy_window` / `mlx_destroy_display` | 解放 | `pf_shutdown` 系 |
| `core/loop.c` | `gettimeofday` / `usleep` | 時間・FPS制限 | `pf_now_ms`（スリープは駆動側の責務に移す） |
| `config/*.c`（gnl 経由） | `open` / `read`（fd） | `.cub` 読込 | メモリリーダ抽象（§4-B） |
| `core/bmp.c` | `open` / `write` | 結果スクリーンショット | native のみ残す（web/サーバでは無効化） |

---

## 1. 目標構造（3層 × 3ビルドターゲット）

```
                    ┌───────────────────────────────────────┐
                    │  sim 層（プラットフォーム非依存・t_game中核） │
                    │  .cubパース / 移動・衝突 / 敵AI /          │
                    │  RSP勝敗・スコア / FPSゴール判定            │
                    └──────────────┬────────────────────────┘
                                   │ 表示用状態（スナップショット）
                    ┌──────────────▼────────────────────────┐
                    │  render 層（フレームバッファにのみ依存）      │
                    │  レイキャスト / 壁・床・スプライト / UI / 手   │
                    └──────────────┬────────────────────────┘
                                   │ pf_* インターフェース
      ┌────────────────────────────┼───────────────────────────┐
┌─────▼─────┐              ┌───────▼──────┐             ┌──────▼──────┐
│ platform/  │              │ platform/    │             │ platform/    │
│ native(MLX)│              │ web(Canvas)  │             │ headless     │
└─────┬─────┘              └───────┬──────┘             └──────┬──────┘
      ▼                            ▼                           ▼
 [native: cub3D]           [render.wasm: ブラウザ]      [sim.wasm: Nodeサーバ]
  従来どおり動作             描画+入力のみ                 sim層のみ・描画リンクなし
```

| ターゲット | リンクする層 | 用途 | 完了ゲート |
|---|---|---|---|
| `cub3D`（native） | sim + render + platform/native | 回帰確認・評価時のマイナー修正対応・チームの開発環境 | 全期間で常時ビルド可・起動可 |
| `render.wasm` | sim(表示補助のみ) + render + platform/web | ブラウザ描画。**シミュレーションはしない**（サーバのスナップショットを描く） | ゲート1（Day 2） |
| `sim.wasm` | sim + platform/headless | サーバ権威シミュレーション（30Hz） | Day 5 |

---

## 2. プラットフォーム層インターフェース仕様（`pf_*`）

新規ヘッダ `includes/platform/platform.h` に集約。**sim 層・render 層は MLX ヘッダを一切 include しない**ことが完了条件。

| 関数（概念シグネチャ） | 役割 | native 実装 | web 実装 | headless 実装 |
|---|---|---|---|---|
| `pf_init(width, height)` → ハンドル | ウィンドウ/描画面の初期化 | `mlx_init` + `mlx_new_window` | Canvas 取得（JS側） | no-op |
| `pf_create_framebuffer(w, h)` → `t_framebuffer` | 32bit ピクセルバッファ確保 | `mlx_new_image` + `mlx_get_data_addr` | WASM ヒープ上の `malloc` バッファ | 不要（リンクしない） |
| `pf_present(fb)` | バッファを画面へ転送 | `mlx_put_image_to_window` | `putImageData`（JS側が WASM メモリを直接読む） | 不要 |
| `pf_now_ms()` → int64 | 単調ミリ秒 | `gettimeofday` | `performance.now()`（import） | Node の時刻（import） |
| `pf_load_texture(window, tex)` → 成否 | **パス指定**で RGBA バッファ供給（契約キーは `.cub` 由来のテクスチャパス。⑤ D-16 改訂） | 既存 XPM 読込を内包 | 事前変換済み RGBA を manifest のパスキー（`./` 正規化）で照合して供給（§4-A） | 不要 |
| `pf_poll_events(input)` | 論理軸/アクションを `t_input` へ反映 | X11 フック（既存） | KeyboardEvent→論理軸変換（JS側） | ネットワーク入力（Node側） |
| `pf_shutdown()` | 解放 | `mlx_destroy_*` 一式 | バッファ解放 | no-op |

**設計上の要点**:

- `t_framebuffer` は「ピクセルポインタ・幅・高さ・1行バイト数」のみの新設構造体。既存 `t_window.screen`（`t_image`）の役割を置き換え、`draw_pixel` はこの構造体を参照する形に変更する（変更は参照先の型だけで、ロジックは不変）。
- **ピクセルフォーマットの罠**: MLX は BGRA（リトルエンディアン int 書き込み）、Canvas の `ImageData` は RGBA。変換は web 側 `pf_present` 相当の JS で一括吸収するか、ビルドフラグでチャンネル順を切り替える。**採用: JS 側で吸収**（C コードを両ターゲットで完全同一に保つ）。
- ループ駆動の逆転: 現行は `mlx_loop` がコールバックを呼ぶ（push型）。web は `requestAnimationFrame`、サーバは `setInterval` が **`main_loop` 相当の1回分関数を外から呼ぶ**（pull型）。よって「1フレーム分の処理」を引数付き関数として公開することが必須（§3）。FPS制限の `usleep` は削除し、駆動側の責務にする。

---

## 3. sim 層の中核 API（`game_step`）仕様

### 3-A. 分離の対象となる現行フロー

実査した `main_loop` の内訳と移行先:

| 現行 `main_loop` の処理 | 移行先 |
|---|---|
| `frame_delta`（時間計測・FPS制限・`time_mult` 算出） | 駆動側へ移動（`dt` は引数で渡す）。`calc_time_mult` は sim 層に残す |
| `apply_input`（`t_input` → カメラ移動・回転） | sim 層 `game_step` 内。**戦闘員ごと**に適用するよう一般化（§3-C） |
| `check_quest` / `update_enemies` / `resolve_rsp_combat` / `check_enemy_contact` / `update_death` | sim 層 `game_step` 内（ロジック不変） |
| `render_frame` | 完全に分離。`game_step` からは**呼ばない** |

### 3-B. 公開 API（概念仕様）

| API | 入力 | 出力 | 備考 |
|---|---|---|---|
| `game_create(cub_text, mode, match_rules)` | `.cub` の**メモリ上テキスト**、モード、試合ルール（先取点数等） | `t_game*` | fd/gnl 依存を切るため、パーサはメモリリーダ経由に変更（§4-B） |
| `game_add_combatant(game, slot, is_ai)` | 席番号・AIフラグ | 戦闘員ID | RSP=4席 / FPS=2席。AI席は既存 `update_rsp_enemy` / 追跡AIが入力を生成 |
| `game_set_input(game, combatant_id, t_input)` | 戦闘員ごとの論理入力 | — | サーバ: WSから / native: `pf_poll_events` から / web: 使わない（表示専用） |
| `game_step(game, dt)` | 経過秒 | 試合状態（進行中/決着） | 1ティック分の全更新。描画・I/O・sleep を含まない |
| `game_snapshot(game, buf)` | — | スナップショット構造体 | §3-D。サーバがシリアライズして配信、クライアントが `render_frame` に渡す |
| `game_apply_snapshot(game, snap)` | スナップショット | — | **クライアント専用**。表示用 `t_game` に受信状態を書き込む（補間は呼び出し側 JS が2スナップショット間で実施） |
| `game_destroy(game)` | — | — | 既存 `exit.c` の解放系から MLX 分離したもの |

### 3-C. マルチプレイヤー一般化（`t_game` の変更方針）

現行は「カメラ=唯一のプレイヤー、`t_enemy` リスト=NPC」。選択肢の比較:

| 案 | 内容 | 長所 | 短所 |
|---|---|---|---|
| **戦闘員統合（採用）** | `t_enemy` を「戦闘員」に一般化し、**人間もリストの1要素**にする。各戦闘員が `t_rsp_state`・位置・向きを持ち、入力源（AI / 外部入力）だけが違う。カメラは「自分の戦闘員IDの位置・向きから毎フレーム導出」 | RSP が既に「プレイヤー+3NPC=4戦闘員」構造で、`resolve_rsp_combat` が全異チームペアを見る設計のため**差分最小**。AI⇔人間の差し替え（切断時AI代替）が入力源の付け替えで済む | プレイヤー移動（`move_camera`）と敵移動（`step_enemy`）の衝突判定コードが現状2系統あり、統一が必要 |
| 並列配列 | `players[4]` を新設し `t_enemy` と別管理 | 既存コードに触れない | 接触判定・描画・スナップショットすべてが2系統になり恒久的に複雑化 |

**採用に伴う具体的変更点**（ロジック仕様。担当: 壱が構造、肆がルール）:

1. 戦闘員構造に「入力源種別（AI / EXTERNAL）」と「保持する `t_input`」を追加。`update_enemies` のループは「AI なら AI が `t_input` を生成 → 共通の移動適用」に再構成。
2. 移動適用は `move_camera` 系（X/Y軸分離・壁ずり・`WALL_MARGIN`）に一本化し、敵の `step_enemy` もこれを使う（当たり半径は戦闘員パラメータ化: `PLAYER_RADIUS`/`ENEMY_RADIUS` を統合）。
3. 描画時、「自分以外の戦闘員」は既存の敵スプライト描画（8方向/ハンド表示）をそのまま使う。「自分」はカメラになるので描画されない（現行と同じ）。
4. 死亡演出 `death_timer`・`spawn` は戦闘員ごとに持つ（現行はプレイヤー1人分のみ）。

### 3-D. スナップショット構造（WS 配信の元データ）

| フィールド | 内容 | 更新頻度 |
|---|---|---|
| `tick` | サーバ側ティック番号 | 毎回 |
| `match` | 状態（waiting/playing/finished）・勝者・スコア（チーム別 or 個人別） | 毎回 |
| `combatants[N]` | id / team / hand / pos(x,y) / dir_angle / alive / is_ai / respawn_timer | 毎回 |
| `world_delta` | 収集済みアイテム座標のリスト・扉開放フラグ（FPSモードのみ） | 変化時のみ |

- 4戦闘員+固定小規模データで **1KB 未満/回** を維持（JSON で十分）。
- 敵AI（FPS の妨害ハザード）も `combatants` と同形式で配る（クライアントは区別せず描画）。
- クライアントの `render_frame` は「スナップショット2つの補間結果を書いた表示用 `t_game`」を読むだけ。**クライアントに勝敗判定コードは存在しない**（サーバ権威の徹底）。

---

## 4. 周辺仕様

### 4-A. アセットパイプライン（XPM 問題）

| 項目 | 決定 |
|---|---|
| 変換 | ビルド時に XPM → 生RGBA（幅・高さヘッダ付き独自 `.tex` バイナリ）へ一括変換。既存 `PythonCodes/` の XPM 処理資産を流用して変換スクリプトを作る |
| native | 従来どおり `mlx_xpm_file_to_image`（変更しない） |
| web | 変換済み `.tex` を fetch → WASM メモリに書き込み `pf_load_texture` が返す |
| テクスチャの契約キー | **`.cub` 由来のテクスチャパス文字列**を正式契約とする（⑤ [BACKLOG.md](./BACKLOG.md) D-16。当初の「`t_texture_id` を ID 空間にする」案は不採用）。web は変換時に生成する `manifest.json` のパスキーと `./` 正規化で照合し、native は従来どおり `t_tex.path` を直接読む |

### 4-B. `.cub` の入力経路

- 現行: `open` + gnl（fd 依存）。サーバ/ブラウザではファイルシステムに依存したくない。
- **決定**: パーサの読み取り単位を「fd から1行」→「メモリ上テキストから1行」に差し替える薄いリーダ抽象を入れる。native は「ファイルを全読みしてから同じメモリリーダに流す」形に統一（gnl は初期読み込みのみに残存可）。
- マップ検証ロジック（壁閉じ・文字種・スポーン数）は**サーバ起動時に一度だけ**実行。クライアントはパース済み結果を信頼する。

### 4-C. ゲームルール変更（肆の担当範囲・sim 層のみで完結）

| 変更 | 対象 | 仕様 |
|---|---|---|
| RSP スコア | `resolve_rsp_combat` | 勝敗解決時に勝者チームへ +1。`match_rules.target_score`（既定10）到達で `match.finished`。即リスポーン・手変更は現行仕様を維持 |
| FPS ゴール | マップ文字 `G` を新設 | `VALID_MAP_CHARACTERS` に追加。戦闘員がゴールセルに入った瞬間に `match.finished`+勝者確定。収集→扉 `D` 開放は関門として現行仕様を維持 |
| FPS 1vs1 | スポーン | FPS モードでも `N/S/E/W` 複数スポーンを許可（RSP の `setup_rsp_combatants` の選定ロジックを流用） |
| 敵ハザード | `check_enemy_contact` | 接触=死亡→数秒後に自スポーンへリスポーン（試合続行）。現行の「死亡演出→終了」を「ペナルティ」に変更 |
| 結果画面 | `bmp.c` | web/サーバでは BMP 保存を無効化（native のみ）。結果は DB に保存されるため不要 |

### 4-D. ビルド設計（Makefile 3ターゲット）

| 項目 | 決定 |
|---|---|
| ソース分類 | 既存 `COMMON_SRCS`/`FPS_SRCS`/`RSP_SRCS` を、層で再分類: `SIM_SRCS`（config/core/enemy/rsp/utils/gnl）・`RENDER_SRCS`（engine/render, raycast の描画側, ui, texture の非MLX部）・`PLATFORM_{NATIVE,WEB,HEADLESS}_SRCS` |
| Emscripten 方針 | 最適化 `-O2`。pthread 無効（並列レンダラは native 専用のまま）。メモリは成長許可。公開関数は §3-B の API のみ。モジュール化して JS 側から複数インスタンス生成可能に（サーバの GameRoom ×N が前提） |
| 検証 | CI で 3 ターゲット全てのビルドを毎 PR で実行（native が壊れる退行を即検知） |

---

## 5. 段階的移行手順（native を壊さない順序）

| Step | 内容 | 完了条件（受入基準） | 目安 |
|---|---|---|---|
| S1 | `platform.h` 新設。MLX 呼び出し 6 ファイルを `pf_*` 経由に書き換え（native 実装は既存コードの移動のみ） | native が従来どおり全マップで動く。sim/render 層に `mlx.h` の include が残っていない | Day 1 |
| S2 | `main_loop` から時間計測を分離し「1フレーム関数+外部駆動」に反転。`usleep` 削除 | native が従来どおり動く（駆動は `mlx_loop_hook` のまま、中身だけ反転） | Day 1–2 |
| S3 | **Emscripten スパイク**: render 層+platform/web で静的マップ1枚を Canvas 表示 | ブラウザで壁・床・天井が描画され、コンソールにエラーなし＝**ゲート1** | Day 2 |
| S4 | 入力・時間を web 実装に接続 | ブラウザで1人称移動・回転ができる（ローカル単体） | Day 3 |
| S5 | `.cub` メモリリーダ化 + `game_create`/`game_step`/`game_snapshot` の API 化 | headless ビルド（`sim.wasm`）が Node 上で RSP を 1000 ティック無エラー実行し、スナップショットを返す | Day 4–5 |
| S6 | 戦闘員統合（§3-C）: 入力源の抽象化・移動一本化・戦闘員別 death/spawn | native の RSP/FPS が回帰なし（プレイ感が変わらない）。AI 3席+外部入力1席の混在テストが通る | Day 4–5（S5と並行、肆が合流） |
| S7 | `game_apply_snapshot` + クライアント側の補間受け口 | 「Node 上の sim.wasm → JSON → ブラウザの render.wasm」の一方通行デモが成立 | Day 5–6 |

**回帰確認の基準**: 各 Step 後に native で `maps/fps_map/1.cub` と `maps/rsp_map/rsp.cub` を起動し、既存 USER_DOC §2〜5 の操作・ルールが変わっていないことを確認する（`make check` の lint ゲートも維持）。

---

## 6. Issue 粒度バックログ（C コード関連）

GitHub Issues にそのまま転記できる粒度。依存列の番号は本表内の Issue 番号。

### 壱（Engine）担当

| # | タイトル | 受入条件 | 依存 | 目安 |
|---|---|---|---|---|
| E-01 | `platform.h` の IF 確定（依存箇所は HEAD 検証済み） | §2 の表どおりの関数一覧がヘッダとしてレビュー承認される | — | 0.5日 |
| E-02 | native プラットフォーム層の実装（既存 MLX コードの移設） | native 全マップ回帰OK。sim/render 層から `mlx.h` include ゼロ | E-01 | 1日 |
| E-03 | `t_window.screen` → `t_framebuffer` 化と `draw_pixel` の参照差し替え | native 回帰OK | E-02 | 0.5日 |
| E-04 | ループ反転（1フレーム関数化・`usleep` 除去・`dt` 引数化） | native 回帰OK。1フレーム関数が I/O・sleep を含まない | E-02 | 0.5日 |
| E-05 | Emscripten ビルド環境と `render.wasm` の最小ビルド | ビルドが通り `.wasm` が生成される | E-03 | 0.5日 |
| E-06 | XPM→RGBA 変換スクリプトとアセット読込（web） | 全テクスチャ（壁/オブジェクト/敵8方向/ハンド6枚/武器/死亡画面）が web で読める | E-05 | 0.5日 |
| E-07 | **ゲート1**: 静的マップの Canvas 描画（BGRA→RGBA 吸収含む） | Chrome で描画・コンソールエラーゼロ | E-05, E-06 | 0.5日 |
| E-08 | web 入力（KeyboardEvent→論理軸）と時間接続 | ブラウザで移動・回転・UIトグルが動く | E-07 | 0.5日 |
| E-09 | `.cub` メモリリーダ化 | native/headless 双方で同一 `.cub` のパース結果が一致 | E-04 | 0.5日 |
| E-10 | sim 公開 API（`game_create`/`set_input`/`step`/`snapshot`/`destroy`） | Node 上で 1000 ティック連続実行・リーク検査OK | E-09 | 1日 |
| E-11 | `sim.wasm` ヘッドレスビルド（描画シンボル非リンク） | Node から複数インスタンス生成できる | E-10 | 0.5日 |
| E-12 | `game_apply_snapshot` と表示用状態の受け口 | sim.wasm→JSON→render.wasm の一方通行デモ成立 | E-10, E-08 | 1日 |
| E-13 | 描画性能ハードニング（内部解像度パラメータ化・計測） | 960×540 で 60fps（開発機基準）。未達なら段階縮小の根拠データを提示 | E-07 | 0.5日 |
| E-14 | CI に 3 ターゲットビルド+native 起動スモークを追加 | 毎 PR で自動実行される | E-05, E-11 | 0.5日 |

### 肆（Gameplay）担当

| # | タイトル | 受入条件 | 依存 | 目安 |
|---|---|---|---|---|
| G-01 | 戦闘員統合の仕様レビュー（§3-C の4項目の詳細化） | 壱と合意した変更仕様書（構造体フィールド表）が確定 | E-04 | 0.5日 |
| G-02 | 入力源抽象（AI / EXTERNAL）の導入 | AI 3席+外部1席の native 混在テストで現行 RSP と同挙動 | G-01 | 1日 |
| G-03 | 移動・衝突の一本化（プレイヤー/敵の統合、半径パラメータ化） | native 回帰OK（壁ずり・すり抜けなしを既存マップで確認） | G-02 | 1日 |
| G-04 | 戦闘員別 death/spawn/respawn_timer | RSP の即リスポーン・FPS の死亡ペナルティが戦闘員単位で動く | G-03 | 0.5日 |
| G-05 | 先取点数の `match_rules` 化（スコア・先取制・勝者判定は実装済み） | `RSP_SCORE_LIMIT` 固定値を試合設定で可変化。テスト用に N=2 でも動く | G-02 | 0.25日 |
| G-06 | FPS ゴールの1vs1化（ゴール判定・`goal_tex` は実装済み） | 2戦闘員のどちらが先に `IS_GOAL` セルへ入ったかで勝者帰属。`D` 関門・収集ルールは現行維持 | G-03 | 0.25日 |
| G-07 | FPS 複数スポーン対応（1vs1 同時スポーン） | 2戦闘員が別地点から同時開始できる | G-06 | 0.5日 |
| G-08 | 敵ハザード化（接触=リスポーンペナルティ） | 死亡演出後に試合続行。試合終了しない | G-04 | 0.5日 |
| G-09 | RSP/FPS 用オンライン対戦マップ各2枚の制作 | 起動検証+チーム内テストプレイで承認 | G-06 | 1日 |
| G-10 | web/サーバでの BMP 保存無効化と結果データ整理 | headless 実行でファイル I/O が発生しない | E-10 | 0.5日 |

**クリティカルパス**: E-01→E-02→(E-03/E-04)→E-05→E-07（ゲート1）→E-08 と、E-09→E-10→E-11→E-12。G 系は E-04 合意後に並行着手できる。壱の合計 ≒ 8.5人日、肆の合計 ≒ 6.5人日で、Day 1〜9 の2レーンに収まる（バッファ含む）。

---

## 改訂記録

| 日付 | 内容 |
|---|---|
| 2026-07-11 | §2・§4-A: `pf_load_texture` を ID 契約から**パス契約**へ改訂（⑤ [BACKLOG.md](./BACKLOG.md) D-16。GATE1 実装の正式化。選択肢比較は ⑤ §0） |
