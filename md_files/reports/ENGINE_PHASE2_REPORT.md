# ENGINE_PHASE2_REPORT — cub3D Engine Phase 2 (E-08, E-09, G-01..G-04)

## G-01 構造変更仕様

### 採用方針

設計書 ① §3-C の「戦闘員統合」を採用する。現行コードはプレイヤーを `game->camera` + `game->rsp.player`、NPC を `t_enemy` + `t_enemy.rsp` として二重に扱っているため、本フェーズでは `t_enemy` を戦闘員の共通キャリアへ拡張する。

G-02 ではまず「入力源種別 + 保持する `t_input`」を各戦闘員へ持たせ、AI は `t_input` を生成し、移動適用は共通経路へ渡す。外部入力席は native では従来の `game->input` を受け取り、毎フレーム自分の戦闘員へ反映する。E-10 で公開 API 化する `game_set_input_source` は、本フェーズでは内部関数として実装してよい（⑤ §2 追補）。

### 入力源 enum

| enum | 意味 | G-02 での扱い |
|---|---|---|
| `INPUT_SRC_AI` | AI がそのフレームの `t_input` を生成する席 | FPS/RSP の既存 AI ロジックを入力生成に分解して使用する |
| `INPUT_SRC_EXTERNAL` | 外部入力が `t_input` を保持する席 | native では `game->input`、web では JS の KeyboardEvent 由来入力を反映する |

### 戦闘員フィールド表

| 所有先 | フィールド | 型 | 目的 |
|---|---|---|---|
| `t_enemy` | `input_source` | `t_input_source` | AI / 外部入力の切替。将来の切断時 AI 代替の前提 |
| `t_enemy` | `input` | `t_input` | AI または外部入力から生成された論理入力を1フレーム保持 |
| `t_enemy` | `radius` | `double` | G-03 の当たり半径パラメータ。既定は旧 `ENEMY_RADIUS`、外部入力席は旧 `PLAYER_RADIUS` |
| `t_enemy` | `death_timer` | `double` | G-04 の戦闘員別死亡演出・復帰待ち。RSP は即リスポーンなので基本 0 |
| `t_enemy` | `spawn` | `t_camera` | 戦闘員別リスポーン元。位置だけでなく向きも保持し、カメラ導出に使える形にする |
| `t_enemy` | `is_player` | `int` | 描画・入力・カメラ導出で自分席を識別する暫定フラグ。E-10 の combatant id API 化で置換可能 |
| `t_game` | `player` | `t_enemy*` | 自分の戦闘員。`game->camera` はこの戦闘員から毎フレーム導出される表示用ビュー |

既存の `t_enemy.rsp` はそのまま保持し、RSP の team/hand/alive/spawn の正本として使う。`game->rsp.player` は互換性維持のため一時的に残すが、G-02 以降は `game->player->rsp` と同期させ、RSP の処理は可能な箇所から `t_enemy` ビューへ寄せる。

### カメラ導出方法

`game->camera` は「自分の戦闘員 (`game->player`) の位置・向きから毎フレーム導出される描画ビュー」とする。

| タイミング | 処理 |
|---|---|
| 初期配置 | 外部入力席の `sprite->pos` と `spawn` を `apply_spawn` 相当の向きで初期化し、同じ値を `game->camera` へコピーする |
| フレーム開始 | `game->input` を `game->player->input` へ反映する |
| 移動適用後 | `game->player->sprite->pos` / `dir_angle` から `game->camera.pos` / `dir` / `plane` / `x_dir` を再構築する |
| 描画 | 「自分の戦闘員」はスプライト描画対象から外し、従来どおり自分の身体は描かない |
| リスポーン | 戦闘員の `spawn` に戻し、直後に camera を導出する。RSP は即時、FPS は `death_timer` 完了時 |

### 設計書との差分・留保

- `t_enemy` という既存名は本フェーズ中は変更しない。ファイル名・描画・AI 参照の差分を抑え、E-10/E-12 の snapshot API 化時に `combatant` 命名へ寄せる余地を残す。
- `game_set_input_source` は E-10 で公開 API 化するため、G-02 では内部関数として追加する。
- D-16 に従い、テクスチャ契約は ID 化せずパス文字列契約を維持する。

## 受入条件チェック

| Issue | 結果 | 確認内容 |
|---|---|---|
| E-08 | OK | web 入力（WASD/←→/I/L/O、`web_set_input`/`web_toggle_option`）、キャプチャ規約（クリック開始・Esc解除・visibilitychange全解放・preventDefault）、web ビルドの PROFILE 無効化（loop.c の WEB_BUILD 分岐）、**テクスチャをマップ必要分のみロード（1.cub で 42/99 枚）**。TextDecoder は §E-08 詳細参照 |
| E-09 | OK | `parse_config_text()` を追加し、native は全読み後に同じメモリリーダへ統一。全13 `.cub` の改修前後 dump が `cmp_status=0`。web は preload FS をやめ、fetch した map text を `web_init(map_text)` へ渡す。 |
| G-01 | OK | 本セクションに構造変更仕様をコーディング前に記載 |
| G-02 | OK | `t_input_source`（AI/EXTERNAL）+ 戦闘員ごとの `t_input` 保持。`update_enemies` は AI 席のみに mode 別 AI を適用。native RSP＝AI 3席+外部1席で回帰なし（ASan 25秒・目視確認は下記） |
| G-03 | OK | 移動・衝突を `combatant_walk_axis` に一本化。半径は per-combatant（プレイヤー PLAYER_RADIUS / NPC ENEMY_RADIUS）で統合前の非対称判定を厳密保存。margin 計算は旧 walk_axis / enemy_can_move と数学的同一（move成分0時の probe 差は no-op のため挙動不変） |
| G-04 | OK | `death_timer`・`spawn` を戦闘員ノードへ移動。`t_game.death_timer`/`t_game.spawn`/`t_rsp_data.player` は削除（正本の二重化排除）。FPS 死亡演出→5秒→リスポーン、RSP 即リスポーンの経路を ASan 実行で通過 |

### E-08 詳細: TextDecoder の恒久方針（GATE1 申し送りの結論）

`-sTEXTDECODER=0`（完全無効化）は **emcc 6.x で廃止済み**（1 か 2 のみ受理）のため採用不能。恒久方針は「**`TEXTDECODER=1` + gate1.html の shim**（glue 読込前に TextDecoder を隠して JS フォールバックに落とし、モジュール生成後に復元）」とし、shim には理由コメントを付与した。emsdk 更新時（Chrome の resizable ArrayBuffer への upstream 対応確認時）に再評価する。

## 実施済み検証（フェーズ2全体）

- `make check`: 13 検査 0 error / 0 warning
- native フルビルド + 3マップ smoke（1.cub / rsp.cub / enemy_line.cub）
- **AddressSanitizer 25秒 × 2マップ**（rsp.cub / enemy_line.cub）: sanitizer 報告ゼロ（接触・リスポーン経路を含む）
- wasm 再ビルド + **Node ヘッドレス 1800 フレーム**（enemy_line.cub、前進・ストレイフ・回転入力込み）: 例外なし
- Node 実測: 必要テクスチャ 42/99、960x540、ヘッドレス約 130fps（120フレーム計測）

## E-09 パース一致確認

- 比較対象: `find maps -name '*.cub' -type f` の全13件。
- 方法: `/tmp/phase2_dump_config.c` で `t_config` の解像度、速度、set、テクスチャパス、色、map.data、map.flags、spawn 配列を改修前後でダンプし、`cmp` で byte-for-byte 比較。比較コードは一時ファイルで、コミット対象外。
- 結果: `/tmp/phase2_parse_before.txt` と `/tmp/phase2_parse_after.txt` は `cmp_status=0`。
- web 経路: `--preload-file maps/fps_map/1.cub` を廃止し、JS が `../maps/fps_map/1.cub` を fetch して `web_init(map_text)` に渡す。Node 検証で `web_init()` / `web_render()` 成功、960x540 framebuffer の非ゼロバイト 1,480,294。

## ブラウザ・プレイ感確認

- ブラウザ（Chromium ベースのブラウザペイン、`http://localhost:8000/web/gate1.html`。2026-07-12 Claude が実操作で確認）:
  - 描画: 壁・床・天井・オブジェクト・武器オーバーレイ・ミニマップ・HUD テキスト表示、**120fps**
  - 入力: クリックでキャプチャ開始（ステータス表示切替）→ 前進・右回転で壁際まで移動（壁で正しく停止）→ `I`/`L` トグル動作 → `Esc` で解除
  - **DevTools Console: ログ・警告・エラー完全にゼロ**（PROFILE 無効化の効果を含む）
  - 残: ユーザーの Windows 側 Chrome での物理キーボード確認（推奨・任意）
- native プレイ感（敵の巡回・追跡・じゃんけん・壁ずり・接触死→リスポーンが統合前と同じか）→ **ユーザー確認待ち**

## E-10 以降への申し送り

- **`game_set_input_source` は未実装**。実体は `t_enemy.input_source` の切替のみで、E-10 の公開 API 化時に追加する（今追加すると未使用関数として CR014 lint に落ちるため意図的に見送り。② §6-B の追補要求は E-10 の受入条件に反映済み）
- **「AI が t_input を生成」は不採用**とした（設計書 ① §3-C-1 からの乖離）。AI の運動モデル（`ENEMY_TURN_DEG_PER_SEC` の回頭制限・整列後前進・`ES` 基準速度）は WASD 型 `t_input` へ写像すると挙動が変わる。受入条件「現行と同挙動」を優先し、AI は従来どおり `dir_angle` を直接操作、移動プリミティブのみ共通化した。E-10 で AI 席の入力形式を「速度意図（方向+前進量）」型として再設計することを推奨
- カメラは移動計算の作業領域として残し毎フレーム戦闘員ノードへ書き戻す方式（浮動小数まで統合前と一致）。**スナップショット駆動の完全導出（combatant→camera）への反転は E-12 で行う**
- RSP の同一フレーム内ペア解決順が「プレイヤー対全NPC→NPC同士」から「リスト順の全ペア」に変わった。各ペアの判定は従来どおり1回ずつで、ゲームプレイ上の可視差はない
- プレイヤーノードの sprite は `world.sprites` に属さない単独所有。E-12 でリモート戦闘員（他人間）を描画する際は、「is_player 以外の EXTERNAL 席には描画スプライトを与える」設計になる点に注意
