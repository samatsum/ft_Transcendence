# F-06 — GameView 統合(render.wasm ロード・Canvas・補間受け口・入力送信)

**位置づけ**: [5-バックログ §5](../02_設計書/5-バックログ.md) の F-06 行を、
「これから何を、どこに、なぜ作るか」の視点でファイル別に展開したもの。
**未着手ドキュメント(着手前スペック)**であり、上流工程レビュー(2026-07-31 samatsum)の結果と、
本作業で確定した4つのローカル決定を含む。契約の正本は
[② WS プロトコル §5](../02_設計書/2-WSプロトコル設計.md) と
[④ フロントエンド設計 §3.3 / §4](../02_設計書/4-フロントエンド設計.md)。両者と食い違ったら本書ではなく設計書を先に直す。

作成: 2026-07-31(着手前) ／ 担当: **samatsum**(本来 hminemur 主担当だが連絡不通のため代行)

---

## 0. 一言でいうと

`/game/:roomId` 画面。Canvas に `render.wasm` を組み込み、ゲーム WS から流れてくる snapshot を
100ms 遅延の2点補間で描画し、キー入力を 30Hz で WS 送信する。**ゲート2 の最終ピース**で、
ここが着地すると 2 ブラウザで対戦が画面に出る。

**評価要件**: 課題書 IV.6「リモートプレイヤー」(コア #2, 2pt) のクライアント側実体。
未達だとゲート2 が成立しない = 対人戦のデモができない。

---

## 1. 依存(何が終わっていないと着手できないか)

| 依存 | 状態(2026-07-31 時点) | 影響 |
|---|---|---|
| **W-10** GameRoom + sim.wasm | ✅ 完了(samatsum) | サーバ側の snapshot 生成元 |
| **W-11** ゲーム WS(join/input/snapshot/event) | ✅ 完了(samatsum) | 通信相手 |
| **E-12** snapshot 受け口 + `snapshot_interp.js` | ✅ 完了(samatsum) | 補間ロジックの移植元 |
| **E-13** 描画ハードニング(`web_init` の内部解像度引数) | ✅ 完了(samatsum) | Canvas 内部解像度の指定口 |
| **W-01** frontend 骨格 | ✅ 完了(samatsum) | React + Vite + Tailwind + shared |
| **F-01** ルータ + ErrorBoundary + StrictMode | 未着手(mamiyaza) | 本来はここに Route を追加すべきだが、**F-06 が単独 Route を先に足すことで先行可** |
| **W-04** 認証 | 未着手(torinoue) | `/game/:roomId` の認可ガード。**開発 stub で先行可、本認証は W-04/W-05 結合時** |
| **W-12** 切断/再接続/AI 代替 | ✅ 完了(samatsum) | `welcome.resume=true` の受け側実装が F-06 に必要 |

**着手可能日**: 5日制では **Day 2〜3**。実際は samatsum が代行で 2026-07-31 以降着手予定。
**クリティカルパス上**。落ちるとゲート2 が成立しない。

---

## 2. 上流工程レビューで見つけた穴と、確定した決定(2026-07-31)

上流(② §5 / ④ §3.3 / shared/ws/game.ts / `web/snapshot_interp.js` / `web/sim_demo/replay.{html,js}`)は
おおむね完成しているが、React/TS 世界にオンライン用途で持ち込む際に**3つの穴**があり、
着手前に以下を確定した。

| # | 穴 | 決定 |
|---|---|---|
| 1 | Vite からの `render.wasm` / `assets/*.tex` / `assets/manifest.json` 配信経路が未定義 | **`make web` の出力を `app/frontend/public/engine/{build,assets}/` へコピー** する Makefile ターゲットを追加。Vite dev は `/engine/build/render.wasm` として自然に配信。`.gitignore` に `app/frontend/public/engine/` を追加。本番(W-15)は nginx が `dist/engine/` を配信 |
| 2 | `snapshot_interp.js` が IIFE + `window.Cub3DSnapshotInterp` global で TS から使えない | `app/frontend/src/engine/snapshotInterp.ts` に **純関数として移植**(`flatten` / `interpolate` を export)。既存 `web/snapshot_interp.js` は `record.mjs` 系との互換のため残す。vitest で unit test |
| 3 | 自席 yaw のローカル優先(② §5-C)の実装位置が未指定 | `interpolate()` に第4引数 `overrideDir?: { id: number, dir: number }` を追加。flat 配列書き込み直前に該当席の dir を上書き。第4引数は optional で Node の `replay.js` 互換 |
| 5 | 入力ループ粒度(状態駆動か keydown 駆動か)が曖昧 | **`setInterval` 30Hz で最新 held + localYaw を全量送信**。keydown/keyup は held ビットマスクと localYaw を書き換えるだけ。`visibilitychange` / `blur` で全キー解放(localYaw は保持) |

**上流に追記が要る箇所(軽微)**:
- ② §5-C に「補間後 flat 配列の自席 dir を local yaw で上書きしてから `web_apply_snapshot`」を1行
- ④ §3.3 に「入力は 30Hz `setInterval` で全量送信。keydown/keyup は held を書き換えるだけ」を1行
- ④ §3.3 か web/README.md に「wasm/textures の Vite 配信経路」を1節

これらは F-06 完了時に PR 内で設計書側も同時に直す。

---

## 3. 触ることが予想されるファイル

| 種別 | パス | 責務 |
|---|---|---|
| 変更 | `Makefile` | `make web` の完了後に `app/frontend/public/engine/{build,assets}/` へコピーするステップ追加 |
| 変更 | `.gitignore` | `app/frontend/public/engine/` を除外 |
| 新規 | `app/frontend/src/engine/snapshotInterp.ts` | `web/snapshot_interp.js` の移植(純関数化 + 型 + `overrideDir` 追加) |
| 新規 | `app/frontend/src/engine/snapshotInterp.test.ts` | vitest。位置線形/角度最短弧/自席上書き/id 不一致無視 |
| 新規 | `app/frontend/src/engine/renderModule.ts` | `render.js` glue の動的 import と `createCub3DModule` 型定義 |
| 新規 | `app/frontend/src/engine/loadTextures.ts` | `assets/manifest.json` から必要分だけ fetch → `_web_register_texture` |
| 新規 | `app/frontend/src/game/useGameSocket.ts` | WS 接続・zod 検証・snapshot バッファ・再接続 backoff・welcome ハンドリング |
| 新規 | `app/frontend/src/game/useEngineRenderer.ts` | canvas mount + `requestAnimationFrame` + 100ms 遅延補間 + `web_apply_snapshot` + `web_render_frame` + BGRA→RGBA present |
| 新規 | `app/frontend/src/game/useGameInput.ts` | Canvas キャプチャ・keydown/keyup・localYaw 積分・30Hz setInterval で input 送信 |
| 新規 | `app/frontend/src/pages/GameView.tsx` | 3フックを組む + HUD 差し込み口(F-07 用)+ Canvas letterbox CSS |
| 変更 | `app/frontend/src/App.tsx` | `/game/:roomId` Route を追加(F-01 前なので暫定ルータで先行) |
| 変更 | `app/frontend/src/main.tsx` | React Router(まだ入っていない)を導入 |
| 変更 | `app/frontend/package.json` | `react-router-dom` + `vitest` + `@types/emscripten`(あるいは自作型) |
| 変更 | `app/frontend/vite.config.ts` | 必要なら `resolve.alias` で `@/engine` エイリアス |
| 新規 | `app/frontend/src/engine/render.d.ts` | `createCub3DModule` と `Module._web_*` の型定義 |

上記は**予想**。着手時に配置と粒度は調整する。

---

## 4. 受入条件

**④ §6 の全画面共通条件**(F-06 単体で見る分):

- [ ] DevTools コンソールを開いたまま `/game/:roomId` へ遷移 → 対戦1試合 → 戻る、で **error / warning ゼロ**(React StrictMode 有効)
- [ ] キャプチャ中の矢印キーがブラウザ既定動作(スクロール)しない
- [ ] タブ非表示で全キー解放され、戻ったとき「押しっぱなし」事故が起きない

**② §10-B の全体 E2E 条件のうち F-06 が担う分**:

- [ ] №1: **2 ブラウザ + AI 2席で RSP クイックマッチが最後まで遊べる**
- [ ] №4: 試合中にタブを閉じ、30 秒以内の再入で人間に復帰する(F-07 の HUD 表示と共同)
- [ ] №5: snapshot < 1KB を維持したまま画面が滑らか(60fps @ 960×540 の維持)

**F-06 固有の受入**:

- [ ] `welcome.map_text` からの `web_init` が成功
- [ ] 補間 100ms 遅延で位置が飛ばない・角度が逆回りしない
- [ ] 自席の視点回転がローカルで即時反映(サーバ ラウンドトリップ待ちの目視違和感なし)
- [ ] unmount 時に WS close / setInterval clear / cancelAnimationFrame / Module 解放が漏れない(メモリリークなし)

---

## 5. 実装手順(samatsum が読む前提の順序)

**Phase A: アセット配信経路の確立(先にここが動かないと何も始まらない)**
1. Makefile に `frontend-engine-assets` ターゲット追加(`app/frontend/public/engine/{build,assets}/` へコピー)
2. `.gitignore` を更新
3. `make web && make frontend-engine-assets` で `app/frontend/public/engine/build/render.wasm` が置かれることを確認
4. Vite dev から `http://localhost:5173/engine/build/render.wasm` が 200 で返ることを確認

**Phase B: エンジンモジュール層(TS 化)**
5. `snapshotInterp.ts` 移植 + `overrideDir` 追加 + vitest
6. `render.d.ts` で `createCub3DModule` 型定義
7. `renderModule.ts` で glue の動的 import(`<script>` 挿入 → `window.createCub3DModule` を await)
8. `loadTextures.ts` で `manifest.json` → 必要分 fetch → `_web_register_texture`

**Phase C: フック層**
9. `useGameSocket.ts`: WS 接続・zod 検証・welcome/snapshot/event/player_status ハンドリング・snapshot バッファ・再接続
10. `useEngineRenderer.ts`: canvas mount + Module 初期化 + rAF ループ(100ms 遅延補間 + apply_snapshot + render_frame + present)
11. `useGameInput.ts`: Canvas キャプチャ + keydown/keyup + localYaw 積分 + 30Hz setInterval + WS send

**Phase D: 画面**
12. `GameView.tsx` で3フックを組む(HUD 領域は F-07 用に空の overlay div だけ用意)
13. React Router 導入 + `/game/:roomId` Route
14. `App.tsx` に暫定リンクを付けて、開発中に手動で遷移できるようにする

**Phase E: 動作確認**
15. 開発 stub 認証で backend を起動 → 手動で `queue_join` → `match_found` → `/game/:roomId` に遷移 → 描画確認
16. 2 ブラウザで対戦の通し

**所要**: 実測前だが 3〜5 日を見込む(1日目 Phase A+B、2日目 Phase C、3日目 Phase D+E、残り2日は F-07/F-08 のバッファ)。

---

## 6. レビュー観点(実装後に見る所)

| 観点 | 具体 |
|---|---|
| **リソース解放** | unmount 時に WS close / setInterval clear / cancelAnimationFrame / `Module._free`。React 19 StrictMode の二重マウントで WS が2本張られない |
| **時計基準** | 補間 100ms 遅延の時刻起点は「最初の snapshot 受信時刻」。tick から `performance.now()` への対応表を1つだけ持つ |
| **welcome 前 snapshot** | welcome を受け取る前に snapshot が来た場合の扱い(バッファに溜めて welcome 後に描画開始)。実装しないと race で真っ黒 |
| **自席 yaw 上書き** | `welcome.combatant_id` を受け取ってから初めて `interpolate({overrideDir: {id, dir}})` に localYaw を渡せる。null(spectator) 時は上書きしない |
| **入力送信の停止** | `welcome.role === 'spectator'` のとき input を送らない(サーバも黙って破棄するが二重防御) |
| **テクスチャの必要分ロード** | E-08 で `wall/` `object/` のみ map 参照分ロード。他は常時ロード(engine_demo.js の実装を踏襲) |
| **match_end 遷移** | close 1000 到達より前にユーザー「ロビーへ戻る」ボタンで `/lobby` へ。close 1000 到達時は無条件遷移 |
| **StrictMode の副作用** | `useEffect` のクリーンアップで WS を close するが、二重マウントで close → 即再 open になる。**dev の StrictMode で挙動が正しいこと**を目視確認 |
| **アセットのキャッシュ** | render.wasm は URL に `?v=...` を付けないと古い glue と食い違って `not a function` になる(engine_demo.js の教訓)。Vite の hash-in-filename に乗せる or 手動でクエリ付与 |

---

## 7. 関連ドキュメント

- [② §5 ゲーム WS 仕様](../02_設計書/2-WSプロトコル設計.md) — 契約の正本
- [② §7 切断・再接続・AI 代替](../02_設計書/2-WSプロトコル設計.md) — welcome.resume/player_status の受け側
- [④ §3.3 GameView](../02_設計書/4-フロントエンド設計.md) — 画面仕様
- [④ §4 WS フックの状態機械](../02_設計書/4-フロントエンド設計.md) — useGameSocket の契約
- [3-エンジンPhase3レポート](./3-エンジンPhase3レポート.md) — E-10/E-11/E-12(sim API / snapshot / 補間)の実装
- [4-エンジンE13E14レポート](./4-エンジンE13E14レポート.md) — 描画ハードニングの実測値
- [説明用/スナップショットと補間](../説明用/スナップショットと補間.md) — 補間の考え方
- [説明用/ループ反転](../説明用/ループ反転-誰がゲームを回しているか.md) — なぜ web_render を使わないか
- [app/shared/src/ws/game.ts](../../app/shared/src/ws/game.ts) — zod 契約
- [web/sim_demo/replay.js](../../web/sim_demo/replay.js) — 下敷き実装
- [web/snapshot_interp.js](../../web/snapshot_interp.js) — 移植元

---

## 8. 状態

| 項目 | 値 |
|---|---|
| ステータス | **未着手**(spec 確定・着手待ち。2026-07-31 時点) |
| 担当 | **samatsum**(hminemur が主担当だが連絡不通のため代行) |
| クリティカルパス | **★はい**(ゲート2 の最終ピース) |
| 拒否条件 | 直接は該当しないが、対戦成立しないと課題書 IV.6(コア #2 リモートプレイヤー)が 0pt |
| 予定 Day | Day 2〜3(5日制)。実際は 2026-07-31 以降 |

---

## 改訂記録

| 日付 | 内容 |
|---|---|
| 2026-07-31 | 初版(着手前スペック)。上流工程レビューの結果と4つのローカル決定を含める。samatsum が hminemur 代行で作成 |
