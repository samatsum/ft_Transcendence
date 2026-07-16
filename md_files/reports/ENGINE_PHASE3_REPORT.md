# ENGINE_PHASE3_REPORT — cub3D Engine Phase 3 (E-10, E-11, E-12)

対象コミット: E-10=`6ee85f5` / E-11=`21bc5c2` / E-12=`55c5a82`（2026-07-16）+ レビュー反映（§レビュー反映 参照）

## 受入条件チェック

| Issue | 受入条件 | 結果 | 確認内容 |
|---|---|---|---|
| E-10 | sim 公開 API 一式 + Node 上で 1000 ティック連続実行・リーク検査 OK | **OK** | `game_create` / `game_add_combatant` / `game_set_input` / **`game_set_input_source`**（② §6-B 追補）/ `game_step` / `game_snapshot` / `game_destroy` を実装。ASan+LSan の native ハーネスで **RSP 3 ゲーム × 1000 ティック（AI2席+外部2席、途中で AI 代替⇔復帰の往復、重複席・範囲外席の拒否を含む）リーク報告ゼロ**。Node（sim.wasm）でも 1000 ティック実行を確認。20000 ティックでは `target_score=5` の決着（state=finished・winner 確定）まで通過 |
| E-11 | `sim.wasm` ヘッドレスビルド（描画シンボル非リンク、`make sim`）。Node から複数インスタンス生成 | **OK** | `make sim` → `web/build/sim.js`(+wasm)。描画側ソース（draw 系・raycast.c・ui・input.c・bmp.c・weapon 描画）を非リンク（sim.wasm 39KB vs render.js 60KB）。Node で **3 モジュールインスタンス × 各 2 ゲーム × 1000 ティック**を併走し、4 席の snapshot と外部入力席の移動を確認（GameRoom ×N の前提を満たす） |
| E-12 | `game_apply_snapshot` + 補間受け口。「Node 上の sim.wasm → JSON → ブラウザの render.wasm」一方通行デモ成立 | **OK**（ブラウザ実機の目視はユーザー確認待ち） | `record.mjs`（sim.wasm を 30Hz 権威実行 → ② §5-C 形式 JSON、偶数 tick 配信）→ `replay.html/js`（100ms 遅延の 2 点補間 → `web_apply_snapshot` → `web_render_frame`）。Node ヘッドレスで全 1005 スナップショットを render.wasm へ再生し **例外ゼロ・975/1004 フレームでフレームバッファ変化・最終 finished で結果画面経路も通過** |

### 付随して満たした関連条件

- **② §8 のサイズ予算（№5 の種）**: snapshot JSON 実測 **avg 513B / max 524B**（4 戦闘員、< 1KB 予算内）。
- **G-05 の中核（先取点の match_rules 化）**: E-10 の API 契約（`game_create(cub_text, mode, match_rules)`）が要求するため先行実装した。`target_score` は ② §4-B の 3–21 のみ受理し、未指定(0)・範囲外は既定の `RSP_SCORE_LIMIT`(10) に落ちる。**native 単体起動の挙動は不変**（`rsp_target_score()` が 0 のとき従来値を返す）。G-05 としての正式受入（肆によるテスト）は残。
- **G-10 の一部（headless でファイル I/O ゼロ）**: sim ビルドは bmp.c / screen.c を非リンクのため、構造的に結果 BMP を書けない。

## 実装の要点

### sim 公開 API（`codes/includes/platform/sim.h` / `codes/srcs/platform/headless/`）

| API | 実装上の要点 |
|---|---|
| `game_create(cub_text, mode, rules)` | パース→世界構築（席なし）。失敗時 NULL（exit しない）。RSP はこの時点で赤(N/W)2+青(S/E)2 のスポーンを抽選し**席番号に固定**（席 0,1=赤 / 2,3=青） |
| `game_add_combatant(game, slot, is_ai)` | 席 1 つ = 戦闘員 1 ノード。戻り値 combatant_id = slot。重複・範囲外は -1。**人間未接続席も先に AI で生成→join 時に切替**の運用（② §6-B）を想定 |
| `game_set_input` / `sim_set_input` | 保持入力の差し替え。`sim_set_input` が ② §5-A の {mv, yaw} → `t_input` 写像を担い、**yaw は絶対角として席の向きへ直接反映**（クライアント権威の視点回転。② §5-C） |
| `game_set_input_source` | AI⇔EXTERNAL の付け替え + AI 経路・保持入力の破棄 + 当たり半径の切替（下記乖離欄参照） |
| `game_step(game, dt)` | native/web と**同一実体**（loop.c）を公開 API に昇格。戻り値 int（1=決着）。ローカルプレイヤー席が無い場合は席ごとの入力適用（`step_external_combatants`）のみが走り、native では同関数は no-op |
| `game_snapshot(game, buf, cap)` | フラット f64 配列（レイアウトは sim.h に定義: header 5 + 戦闘員 9/体）。JSON 化と tick 付与は Node 側の責務（② §6-B「wasm 内で文字列化しない」） |
| `game_destroy` | exit_game の解放系から exit()/MLX を除いたもの。部分初期化状態でも安全 |

- headless の `pf_load_texture` は **1x1 ダミーで常に成功**する。native と同じ資産初期化経路（load_player_assets 等）を分岐なしで通すためで、テクスチャ有無で init 挙動が割れない。
- 自陣踏み込みの手変え（`rsp_home_rehand`）は「カメラ基準・プレイヤーのみ」から「**EXTERNAL 席のリスト走査**」へ一般化し、`on_home` を `t_game` 集約から戦闘員ごと（`t_rsp_state.on_home`）へ移した。native は外部席がプレイヤー 1 席のみ + ノード位置はカメラと毎フレーム同期のため**同一結果**。
- `t_enemy.combatant_id` を追加（既定 -1。API 経由の席と、マップ由来敵ハザード id=8〜 のみ付与）。

### E-12 クライアント受け口

- `game_apply_snapshot(game, flat, len, view_id)`（platform/web）: 視点席は**カメラを戦闘員から完全導出**（Phase 2 申し送りの「カメラ導出の反転」はこのスナップショット駆動モードで実施。ローカル操作の native/web は従来の「カメラが正本」経路のまま）。他席は位置・向き・チーム×手テクスチャを毎フレーム上書きするため、表示側の初期ランダム配置に正しさが依存しない。
- `web_render_frame()`: game_step を通さず描画のみ。スナップショット駆動中にローカル sim が権威状態と競合しない。
- 補間計算は `web/snapshot_interp.js`（④ §4 の分担で壱の担当分。位置=線形・向き=最短弧・離散値は古い側スナップショット。**F-06 がそのまま流用する前提**）。

### デモの実行手順（2 コマンド）

```
make sim && make web
node web/sim_demo/record.mjs        # sim.wasm → web/sim_demo/snapshots.json
python3 -m http.server 8000         # → http://localhost:8000/web/sim_demo/replay.html
```

## 設計との乖離・留保

| # | 内容 | 種別 |
|---|---|---|
| 1 | **snapshot に tick を含めない**。① §3-D の表は tick を snapshot のフィールドとするが、② §5-C/§6-B で「tick はサーバ tick 番号・シリアライズは Node 側」と確定しているため、sim はゲーム状態のみを返し、tick は GameRoom が JSON 化時に付与する（record.mjs がその形を実演）。①の表現の問題であり実害はないが、①改訂時に注記を推奨 | 軽微（設計書間の解釈統一） |
| 2 | **world_delta（FPS の収集済み座標・扉開放）は未実装**。RSP（ゲート2）に不要のため。FPS オンライン化（G-06〜G-08 / W-14）の際に「収集座標リストの蓄積 + 初回全量送信（② §5-C）」を追加する | 意図的な後送り |
| 3 | **FPS モードのヘッドレスは未完成**: 射撃（render の depth バッファ依存）・ゴール/収集判定（カメラ基準の check_quest で、headless では `game->player` が無く**一切走らない**）・追跡 AI（カメラ座標参照）・接触死（プレイヤーのみ）が「ローカルプレイヤー席」前提のまま。**snapshot の FPS 勝者も常に -1** で、headless の FPS は決着に到達できない。G-06〜G-08（肆担当）で戦闘員基準へ一般化するまで、**FPS モードで W-10 のルームを立てないこと**（レビュー P1） | 依存 Issue 待ち（FPS レース #10 着手前に必須） |
| 4 | **AI 席の t_input 生成は不採用のまま**（Phase 2 申し送りの「速度意図型入力への再設計」は見送り）。AI は従来どおり dir_angle 直接操作で、受入条件「現行と同挙動」を優先。切断時 AI 代替は input_source の付け替えで足りることを E-10 ハーネスで確認済みのため、再設計の必要性は現状ない | ① §3-C-1 からの乖離継続（Phase 2 で報告済み） |
| 5 | **AI⇔EXTERNAL 切替で当たり半径が 0.8⇔0.5 に変わる**。native の「プレイヤー=0.5 / NPC=0.8」を席の現在の入力源に対応させた。AI 代替中の席は native の NPC と同じ移動判定になる一方、試合中の切替で他戦闘員との間合いがわずかに変わる。固定化したい場合は W-12 の実装時に判断を仰ぎたい | 判断事項（軽微） |
| 6 | `target_score` の受理範囲は ② §4-B / ⑤ G-05 追補の **3–21** に従った。① §6 G-05 の「テスト用に N=2 でも動く」とは矛盾するため、テストは N=3 を最小とする（E-10/E-12 の検証は N=3, N=5 で決着まで確認済み） | 設計書間の矛盾（②を正とした） |
| 7 | `sim.js` の出力先は暫定で `web/build/`（render.js と同じ場所）。backend ディレクトリ（W-01、D-18）確定後に配置・参照方法を決める | 暫定 |

## 実施済み検証（フェーズ3全体）

- `make check`: 13 検査 0 error / 0 warning（毎コミット時）
- native フルビルド + fps/rsp 両マップ 5 秒 smoke（毎 Issue 完了時）
- **ASan+LSan** native ハーネス: RSP 3 ゲーム × 1000 ティック → リーク・sanitizer 報告ゼロ。20000 ティック × 3 ゲームでも同様（決着経路含む）
- **Node sim.wasm**: 3 インスタンス × 2 ゲーム × 1000 ティック併走
- **一方通行デモ**: record 67 秒ぶん（1005 snapshot、決着まで）→ Node ヘッドレスで render.wasm へ全量再生（例外ゼロ・フレーム変化・結果画面）
- **web ローカルプレイ回帰**: web_init → web_set_input → web_render を両マップ 600 フレーム（フレームバッファ非ゼロ 142万/148万バイト、Phase 2 と同水準）
- 残: **ブラウザ実機での replay.html 目視 + DevTools Console ゼロ確認**（ユーザー確認推奨。手順は上記「デモの実行手順」）。native のプレイ感確認（Phase 2 から継続のユーザー確認待ち項目）

## W-10（GameRoom + sim.wasm 統合）への申し送り

1. **呼び出し順序の正**: `createCub3DSimModule()` → `sim_create(cub_text_ptr, is_rsp, target_score)` → `game_add_combatant(game, slot, is_ai)` × 定員（RSP=4 / FPS=2）→（join 時）`game_set_input_source(game, slot, EXTERNAL=1)` → 毎 tick `sim_set_input` → `game_step(game, 1/30)`（戻り値 1 で finished 遷移）→ 偶数 tick で `game_snapshot` → Node 側で JSON 化 + tick 付与 → 配信 → closed で `game_destroy`。
2. **フラット配列のレイアウトは `codes/includes/platform/sim.h` が正本**（header 5 + 戦闘員 9/体、全て f64）。`record.mjs` の `takeSnapshot()` がそのまま JSON 化の参照実装。
3. **席とチームの対応は固定**: RSP slot 0,1=赤 / 2,3=青。マップは赤(N/W)・青(S/E)各 2 スポーン必須で、不足すると `sim_create` が NULL を返す（W-14 のマップホワイトリスト検証と整合させること）。
4. **combatant_id は snapshot 内の並び順と無関係**（内部リストは生成の逆順）。クライアント・サーバとも必ず id で照合する。マップ由来の敵ハザードは id=8〜。
5. `target_score` は 3–21 のみ受理（それ以外は既定 10）。W-11 のスキーマ検証（№6）でも同範囲で弾くこと。
6. 決着後の `game_step` は状態を進めず 1 を返し続ける。finished 検知は戻り値で行い、以後 tick を止めてよい（② §6-A）。
7. yaw はクライアント権威（② §5-C）として `sim_set_input` が席の向きを直接上書きする。サーバ側で yaw の範囲検証は不要（角度として無害）だが、NaN/Inf は JSON スキーマ側（W-11）で弾くこと。
8. 1 モジュールインスタンスで複数ゲームを併走できることは確認済みだが、**設計どおり「1 ルーム = 1 インスタンス」を推奨**（メモリ成長とクラッシュ隔離のため）。
9. E-12 のクライアント側は `web_apply_snapshot(flat_ptr, len, view_id)` + `web_render_frame()` + `web/snapshot_interp.js`。W-11/F-06 は snapshots.json の代わりに WS 受信バッファを同じ経路へ入れるだけでよい。

## レビュー反映（2026-07-16。W-10/W-11 結合前の指摘対応）

| 指摘 | 対応 |
|---|---|
| [P1] FPS headless が決着できない（check_quest がローカルプレイヤー前提・snapshot の FPS 勝者が常に -1） | **仕様どおり未対応のまま**（乖離 #3 を上記のとおり強化し、「FPS レース #10 着手前に G-06〜G-08 で必須」「FPS で W-10 のルームを立てない」を明記） |
| [P2] `game_apply_snapshot` がリスト順割当（id 照合になっていない） | **combatant_id 照合へ修正**。id 一致ノードへ反映 → 未知 id は「snapshot に現れない id を持つノード」を主張して割当（初回は -1 が順に埋まる）→ snapshot から消えた id のノードはマップ外へ退避 → 視点切替時は旧表示ノードを未割当へ戻す（ゴースト防止）。Node で「順序シャッフル・余剰ハザード id=8・entry 消滅（退避）・視点切替」の4系を検証し、既存の全量再生（531 snapshot）も回帰なし |
| [P2] Makefile にヘッダ依存が無い | **native は `-MMD -MP` + `.d` include、web/sim は全ヘッダ + Makefile を prerequisite に追加**。types.h の touch で依存 38 ファイルの再コンパイルを確認 |
| [P3] `game_add_combatant` で add_enemy 失敗時に sprite が残る | **`delete_sprite_node` で掃除**（spawn_rsp_npc と同じ失敗時パターンに統一） |

- 反映後の再検証: `make check` 0 error / native 両マップ smoke / ASan 3×1000 ティック リークゼロ / record→replay 全量再生 / web ローカルプレイ回帰 600 フレーム×2 マップ、すべて通過。
- 補足（W-10 向け）: 表示ノードの主張はスナップショットの entry 順に行われるため、**席の entry をハザードより先に並べること**。sim の `game_snapshot` は生成の逆順（ハザード→席の順に生成するため席が先頭）でこの条件を自然に満たす。

## ゲート2（2 ブラウザ 2vs2 RSP）へ向けた残作業

| レーン | 残 Issue | 状態・備考 |
|---|---|---|
| 壱（Engine） | **E-08〜E-12 完了** | ゲート2 の壱担当分は本フェーズで完了。E-13/E-14 はゲート2 非依存 |
| 肆（Gameplay） | G-05 の正式受入 | 中核は E-10 で実装済み。肆による native テスト（可変先取点）と、①§6 の「N=2」矛盾の解消のみ |
| 弐（Backend） | W-01（骨格）→ W-08（ロビーWS）→ W-09（マッチメイキング）→ **W-10（GameRoom+sim.wasm）** → W-11（ゲームWS）→ W-12（切断/AI代替） | クリティカルパス。W-10 は本レポートの申し送り 1〜9 で着手可能。W-12 の中核 API（`game_set_input_source`）は検証済み |
| 参（Frontend） | F-01〜F-05（雛形〜ロビー）→ F-06（GameView 統合）→ F-07（HUD）→ F-08（マッチ遷移） | F-06 は `web_apply_snapshot` / `web_render_frame` / `snapshot_interp.js` を流用。入力送信は E-08 のキャプチャ規約 + ② §5-A |
| 横断 | welcome.map_text 経路（W-14 の一部）、ルーム層イベント（countdown/match_start） | sim は waiting/countdown を持たない設計（② §5-C）なので、ルーム層で実装 |
