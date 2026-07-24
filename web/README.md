# web — WASM 成果物と、それを動かす JS の置き場

C エンジンを `emcc` で WASM にビルドした成果物（`build/`）と、それをブラウザ / Node
から動かす JavaScript を置くフォルダです。**ここに TypeScript（`app/`）は含みません。**
仕組みの背景は [説明用ドキュメント](../md_files/説明用/) を参照。

---

## ファイルの役割

| ファイル / フォルダ | 役割 | コメント |
|---|---|---|
| `build/` | `make web` / `make sim` が生成する `render.wasm` / `sim.wasm` と、その glue JS | **生成物。git 管理外** |
| `assets/` | `make web` が XPM から変換する RGBA テクスチャ | **生成物。git 管理外** |
| `engine_demo.html` / `engine_demo.js` | **ブラウザでエンジンを 1 人で動かす動作確認ページ**。`?map=` でマップ、`?res=` で内部解像度を切替 | 旧名 `gate1`（下記） |
| `snapshot_interp.js` | サーバ権威モデルの**補間**（2 つの snapshot → フラット f64 配列）。位置=線形・向き=最短弧 | F-06 がそのまま流用する |
| `sim_demo/record.mjs` | `sim.wasm` を Node で回して snapshot の JSON 列を録画する（**サーバ役**のデモ） | W-10 でここが WS 配信になる |
| `sim_demo/replay.html` / `replay.js` | 録画した snapshot を補間して再生する（**ブラウザ役**のデモ） | W-10 / F-06 の下敷き |
| `bench_render.mjs` | 解像度別の描画スループット（fps）を計測する | E-13 の根拠データ |
| `package.json` | このフォルダを **CommonJS スコープに固定する shim** | 下記。**消すと壊れる** |

---

## `engine_demo` はオンライン対戦では使わない

`engine_demo.*` は **ローカル単体（1 人＋AI、サーバなし）の動作確認ページ**です。
`web_render`（＝ローカルで `game_step` + 描画）を毎フレーム回します。

**オンライン対戦（W-10 以降）では、このファイルは使いません。** オンラインの描画は
フロントエンド（`app/frontend`、F-06 が TypeScript で実装）が担い、次を再利用します。

| オンラインで使う | 使わない |
|---|---|
| `render.wasm`（同じ C エンジン。描画用） | `engine_demo.js`（ローカル駆動のため） |
| `snapshot_interp.js`（補間） | `web_render`（ローカルで `game_step` してしまう） |
| `game_apply_snapshot`（表示専用の受け口） | — |

つまりオンラインは「`sim_demo/replay.html` の作り（snapshot 駆動）」を TypeScript で
本番化したもので、`engine_demo`（ローカル単体）とは駆動の仕方が別です
（[④ スナップショットと補間](../md_files/説明用/スナップショットと補間.md) / [② ループ反転](../md_files/説明用/ループ反転-誰がゲームを回しているか.md)）。

---

## 名前の由来：なぜ「engine_demo」？　旧名「gate1」とは

もとは `gate1.html` / `gate1.js` という名前でした。`gate1` は機能名ではなく、
**プロジェクトのマイルストーン名**です。「GATE1 ＝ 静的マップがブラウザの Canvas に
描けること」が C→WASM 移植の**最初の関門（ゲート1）**で、その関門を通すために作った
確認ページだったので `gate1` と呼んでいました。

ただ「gate1」では用途が伝わらないため、**`engine_demo`（エンジンの動作確認デモ）に
改称**しました。実装レポート（`md_files/03_実装レポート/`）には当時の名前 `gate1` の
まま残っています（過去の記録なので変更しません）。

## `package.json` について（JSON はコメントを書けない）

`package.json` は JSON なので `//` コメントを**書けません**（npm がエラーで弾く）。
そのため役割は **`description` フィールド**に書いてあります。中身を要約すると:

> このフォルダだけを **CommonJS** に固定するための shim。ルートの `package.json` が
> `"type": "module"`（ESM）なので、`emcc` が生成する `web/build/*.js`（CommonJS の glue）が
> ESM と誤認され、`require()` の戻り値が関数でなくなる（`TypeError: createSim is not a function`）。
> それを防ぐために置いてある。**npm workspaces には含めない。消すと `record.mjs` 等が壊れる。**

---

## さわるときの注意

- `build/` と `assets/` は**生成物**（`make web` / `make sim` が作る）。手で編集しない。
- ローカルで開くには HTTP 配信が要る（`python3 -m http.server 8000` → `/web/engine_demo.html`）。
  `file://` 直開きは wasm を fetch できず動かない。詳しい起動手順は
  [ルート README の「ブラウザで遊ぶ」](../README.md)。
