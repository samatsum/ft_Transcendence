# コード想定 Q&A ― テクニカルリード自己確認シート

**対象**: samatsum（テクニカルリード）。評価・チーム説明で「コードのどこで何をしているか」を
即答できるようにするための自己確認シート。**答えの隣に「どこを見れば確認できるか」**を付けたので、
迷ったら実物を開いて裏を取れる。

> 使い方: 質問だけ見て頭の中で答え → 下の答えと照合 → ズレたらファイルを開いて確認。
> 仕組みの「なぜ」は各行のリンク先（説明用ドキュメント）に厚く書いてある。

---

## A. 起動と 1 フレームの流れ

**Q. プログラムはどこから始まり、1 フレームはどう回る？**
A. `main()` → 引数/マップ検証でモード決定 → 初期化 → `pf_setup_hooks`（イベント登録）→
`pf_loop`（制御を MLX に渡す）。以後 MLX が毎フレーム `main_loop` を呼ぶ。
`main_loop` は時間を測って `game_frame`（= `game_step` + `render_frame` + `pf_present`）。
- 確認: [`common/main.c`](../../codes/srcs/common/main.c) / [`common/core/loop.c:31`](../../codes/srcs/common/core/loop.c)
- なぜ: [ループ反転](./ループ反転-誰がゲームを回しているか.md)

**Q. `game_step` の中身と順序は？（順序に意味がある）**
A. ①決着済みなら即 return ②`update_death`（全戦闘員の死亡タイマー）③自席が生存なら
`apply_input` ④`step_external_combatants`（外部入力席）⑤`update_enemies`（AI 席）
⑥`mode_ops.combat`（FPS=接触判定 / RSP=じゃんけん）⑦`check_quest`（ゴール・収集）。
- 確認: [`common/core/loop.c:67`](../../codes/srcs/common/core/loop.c)（`game_step`）
- なぜ死亡を先に: 死んだ席が同 tick でゴール/収集しないため（レビュー P1 修正）

**Q. native / web / server で 1 フレームを「回す人」は誰？**
A. native=MLX（`mlx_loop`）、web=ブラウザ（`requestAnimationFrame`）、
server=Node（`setInterval`。W-10 で実装）。**呼ばれる `game_step` は 3 つとも同一**。
- なぜ: [ループ反転](./ループ反転-誰がゲームを回しているか.md)

---

## B. プラットフォーム層（pf_*）

**Q. MLX に依存しているのはどこ？ 何ファイル？**
A. `pf_*` の native 実装 **1 ファイルだけ**（`platform/native/platform_native.c`）。
sim 層・render 層は MLX を呼ばない。確認は `grep -rln 'mlx\.h\|mlx_[a-z]' codes/srcs`。
- 確認: [`platform/native/platform_native.c`](../../codes/srcs/platform/native/platform_native.c)
- なぜ: [pfプレフィックス関数について](./pfプレフィックス関数について.md)

**Q. どうやって native / web / headless を切り替えている？**
A. 切り替えていない。3 実装が**同じ関数名**を持ち、Makefile がターゲットごとに 1 つだけ
リンクする（`NATIVE_/WEB_/SIM_PLATFORM_SRCS`）。リンカが解決するだけ。
- 確認: [`Makefile`](../../Makefile) の各 `*_PLATFORM_SRCS`

**Q. headless（サーバ）が「何もしない」pf 関数だらけなのはなぜ？**
A. サーバは描画も入力もループも持たないから。空実装にすることで、ロジック側に
`if(サーバ)` を書かずに済む。確認は `platform/headless/platform_headless.c`。

---

## C. 戦闘員統合・移動・衝突

**Q. プレイヤーと NPC はどう区別している？**
A. 区別しない。両方 `world.enemies` の 1 ノード（`t_enemy`）で、違いは
`input_source`（`AI` / `EXTERNAL`）だけ。自席は `is_player`。
- 確認: [`enemy/enemy_types.h`](../../codes/includes/enemy/enemy_types.h)（`t_enemy` / `t_input_source`）
- なぜ: [戦闘員統合](./戦闘員統合-人もNPCも同じリスト.md)

**Q. 外部入力席（サーバの人間）はどこで動く？**
A. `step_external_combatants` が `input_source==EXTERNAL` かつ非自席の生存席へ、保持中の
`t_input` を適用。native/web 単体では該当席が無く no-op。
- 確認: [`common/core/combatant.c:22`](../../codes/srcs/common/core/combatant.c)

**Q. 壁ずり（片軸が壁でももう片軸へ滑る）はどう実現？**
A. 移動を X 軸 → Y 軸の順に分けて当たり判定する（`combatant_walk` が軸分割）。
プレイヤーの `move_camera` 系と同じ挙動に統一（G-03）。
- 確認: [`common/core/combatant.c`](../../codes/srcs/common/core/combatant.c) / [`common/engine/raycast/camera.c:23`](../../codes/srcs/common/engine/raycast/camera.c)

---

## D. 敵 AI

**Q. FPS の敵はどう索敵・追跡する？**
A. 正面視野内に戦闘員が入り、間に遮蔽（壁・通行不可・閉扉）が無ければ検知して追跡。
見失っても既定 5 秒（`.cub` の `ET`）は追跡、時間切れで巡回へ。`P` セルを周回。
- 確認: [`fps/enemy/`](../../codes/srcs/fps/enemy/)（`fps_enemy_sense.c` / `fps_enemy_ai.c`）

**Q. RSP の NPC AI は何を基準に動く？**
A. 最寄りの異チーム戦闘員を見て「勝てる手なら追跡・負ける手なら逃走・あいこは徘徊」。
- 確認: [`rsp/enemy/rsp_enemy_ai.c:21`](../../codes/srcs/rsp/enemy/rsp_enemy_ai.c)（`update_rsp_enemy`）

---

## E. ゲームルール（RSP / FPS）

**Q. RSP の勝敗・スコアはどこで決まる？先取点は可変？**
A. `resolve_rsp_combat` が全異チームペアのじゃんけんを解決し、勝者チームへ
`award_rsp_point`。`match_rules.target_score`（既定 `RSP_SCORE_LIMIT`）到達で決着。
下限は 1（3〜21 の製品範囲チェックは WS 層の責務、エンジンは機構）。
- 確認: [`rsp/core/rsp_combat.c:34`](../../codes/srcs/rsp/core/rsp_combat.c) / 席配置は [`rsp/core/rsp_setup.c:23`](../../codes/srcs/rsp/core/rsp_setup.c)

**Q. FPS のゴール・収集・扉・敵ハザードはどこ？**
A. `check_quest` が全戦闘員の足元を見てゴール到達・アイテム収集を判定（死亡中は対象外）。
接触＝死亡ペナルティは `check_enemy_contact`、復帰は `respawn_combatant`。
- 確認: [`fps/core/fps_item.c:30`](../../codes/srcs/fps/core/fps_item.c)（`check_quest`）/
  [`fps/core/fps_respawn.c:17`](../../codes/srcs/fps/core/fps_respawn.c)（`check_enemy_contact`）/
  [`common/core/respawn.c:45`](../../codes/srcs/common/core/respawn.c)（`respawn_combatant`）

**Q. マップ文字 `G`（ゴール）は新設した？**
A. していない。`IS_GOAL` セル + `goal_tex` は元から実装済み。G-06 は「勝者を席 id に
帰属させる」だけ。`D`（扉）`M`（敵）も元からある。
- 確認: [`config/config.h`](../../codes/includes/config/config.h)（`IS_GOAL` / `DOOR_CHAR` / `VALID_MAP_CHARACTERS`）

---

## F. sim 公開 API とスナップショット

**Q. サーバから使う API は？ 呼び出し順は？**
A. `game_create` → `game_add_combatant` ×定員 → 毎 tick `sim_set_input` → `game_step`
→ `game_snapshot` → JSON 化（Node）。`game_set_input_source` で席を AI⇔外部に切替。
- 確認: 正本 [`includes/platform/sim.h`](../../codes/includes/platform/sim.h) / 実装 [`platform/headless/sim_api.c`](../../codes/srcs/platform/headless/sim_api.c)
- 手順書: [3-エンジンPhase3レポート](../03_実装レポート/3-エンジンPhase3レポート.md)「W-10 への申し送り」

**Q. スナップショットの形は？ tick は誰が付ける？**
A. フラットな f64 配列（ヘッダ 5 + 戦闘員 1 人 9）。**tick は sim が持たず Node が採番**、
JSON 化も Node の責務。レイアウトは sim.h の `#define` が正本。
- 確認: [`includes/platform/sim.h`](../../codes/includes/platform/sim.h)（`SIM_SNAP_*`）/ [`platform/headless/sim_api.c:261`](../../codes/srcs/platform/headless/sim_api.c)（`game_snapshot`）
- なぜ: [スナップショットと補間](./スナップショットと補間.md)

**Q. `game_apply_snapshot` は誰が使う？ どこにある？**
A. **クライアント専用**（サーバは使わない）。id で戦闘員を照合し、表示用 `t_game` に書く。
勝敗は一切判定しない。
- 確認: [`platform/web/web_snapshot.c:42`](../../codes/srcs/platform/web/web_snapshot.c)

**Q. `world_delta`（FPS の収集/扉）は実装済み？**
A. **未実装**（唯一の意図的な後送り）。ゲート2 の RSP に不要なため。FPS オンライン化
（W-14）で追加予定。
- 確認: [3-エンジンPhase3レポート](../03_実装レポート/3-エンジンPhase3レポート.md) 申し送り №2

---

## G. マップ・ビルド・品質

**Q. RSP か FPS かはどう決まる？**
A. マップの**置き場所**。`maps/rsp_map/` なら RSP、`maps/fps_map/` なら FPS。
`.cub` の中身では宣言しない。RSP のスポーンは `N/W`=赤・`S/E`=青。
- 確認: [`common/main.c:97`](../../codes/srcs/common/main.c)（`set_mode_from_path`）
- なぜ: [cubマップの読み方](./cubマップの読み方.md)

**Q. make のターゲットは？ sim に描画が入らないのはなぜ？**
A. `make`（native）/ `web`（render.wasm）/ `sim`（sim.wasm）/ `test`（受入 85 検査）。
sim は `SIM_RENDER_EXCLUDES` で描画ソース（draw/raycast/sprite/font 等）をリンクから外す。
- 確認: [`Makefile`](../../Makefile)
- なぜ: [3つのビルドターゲット](./3つのビルドターゲット.md)

**Q. コード品質はどう担保している？（テクニカルリードの見せ場）**
A. `make check`（独自 lint。CR001〜。common→モード依存も検知）+ `make test`（sim 85 検査）
+ CI（3 ターゲットビルド + check + test + xvfb スモーク）を毎 push。
- 確認: [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml) / `make check`

---

## H. 「詰まったら」テクニカルリードの動き方

- **合流点（W-11 × F-06）を先に紙合わせ**する。snapshot の JSON 形（② §5-C）を Day 1 に。
- **C を触る PR が来たら必ず見る**（原則 C は凍結。触る必要＝設計の見落としのサイン）。
- 「これ何？」には**まず該当の説明用ドキュメントを指す**。無ければ 1 本書く（それが Tech Lead の文書化）。
- 迷ったら **この Q&A の「確認」リンクを開いて実物で答え合わせ**する。憶測で答えない。

---

## 関連資料

- 仕組みの理解（全体）: [説明用ドキュメント一覧](<../ドキュメント地図(最初にこれ嫁).md>)
- 実装の詳細記録: [03_実装レポート](../03_実装レポート/)
- 現行実装の地図: [開発ドキュメント](../04_エンジン資料/開発ドキュメント.md)（`game_step` の順序・ディレクトリ実態）
- API/ルールの正本: [1-エンジン分離設計](../02_設計書/1-エンジン分離設計.md)
