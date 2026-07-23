# なぜ Node で C を動かせるのか — WebAssembly 入門

**対象**: チームメンバー全員
**一言でいうと**: **C のコードを「ブラウザや Node が実行できる形」に翻訳した**、
それが WebAssembly（WASM）です。「TypeScript のサーバが C のゲームを動かす」という、
一見あべこべな構成が成り立つ理由を説明します。

---

## 1. 何が不思議に見えるか

私たちの構成は、こう聞くと変に感じます。

> **Node（JavaScript の実行環境）の中で、C で書いたゲームエンジンが動いている。**

普通、C はコンパイルして「その OS 専用の実行ファイル（Linux なら ELF）」になります。
JavaScript の世界とは別物のはずです。なぜ Node が C を動かせるのか。

答えは **「C を、実行ファイルではなく WebAssembly という中間形式にコンパイルしたから」**です。

---

## 2. WebAssembly（WASM）とは

WASM は、**ブラウザや Node が直接実行できる、低レベルなバイナリ形式**です。

```
ふつうの C     →  Linux 実行ファイル（cub3D）   … Linux でしか動かない
WASM 向けの C  →  .wasm ファイル                … ブラウザでも Node でも動く
```

ポイントは、**WASM が特定の OS ではなく「ブラウザ/Node の仮想マシン」向け**である
ことです。だから 1 つの `.wasm` が、ブラウザでも Node でも同じように動きます。

そして WASM は**ネイティブに近い速さ**で動くよう設計されています。JavaScript に
翻訳し直すのではなく、そのまま高速に実行されます。だからレイキャストのような
重い計算も現実的な速度で回ります。

> **なぜこれを使うのか**: [3つのビルドターゲット](./3つのビルドターゲット.md) の
> とおり、私たちは **C のゲームロジックを 1 つに保ちたい**。
> WASM なら、その C をブラウザ（描画）でも Node（判定）でも動かせます。
> TypeScript に書き直す（＝ロジックの二重管理）を避けられるのが最大の理由です。

---

## 3. 誰が翻訳するのか — Emscripten

C → WASM の翻訳をするのが **Emscripten（emcc）** というコンパイラです。
`gcc` の代わりだと思ってください。

```bash
gcc  ...   →  cub3D          （Linux 実行ファイル。make）
emcc ...   →  sim.wasm ＋ sim.js  （WASM ＋ 橋渡しの JS。make sim）
```

注目してほしいのは、emcc が **2 つ**のファイルを吐くことです。

| ファイル | 中身 | 役割 |
|---|---|---|
| `sim.wasm` | 翻訳された C 本体 | 実際に動くゲームロジック |
| `sim.js`（glue） | Emscripten が自動生成する JavaScript | **JS と WASM の橋渡し** |

`.wasm` は単体では使いにくい（メモリの確保や関数呼び出しの作法が生々しい）ので、
**それを JS から扱いやすくする「glue（糊）コード」**が一緒に生成されます。
私たちが Node から呼ぶのは、この `sim.js` です。

---

## 4. 実際に Node から呼んでいるところ

[web/sim_demo/record.mjs](../../web/sim_demo/record.mjs) が、まさにこれをやっています。

```js
// glue（sim.js）を読み込む
const createSim = require(here('../build/sim.js'));

// WASM を初期化して、モジュール M を得る
const M = await createSim();

// あとは C の関数を M._関数名(...) で呼べる
const game = M._sim_create(mapPtr, 1, TARGET_SCORE, SEED);   // C の sim_create
M._game_step(game, 1 / 30);                                  // C の game_step
M._game_snapshot(game, snapPtr, 256);                        // C の game_snapshot
```

C で書いた `sim_create` / `game_step` / `game_snapshot` が、
JS から `M._sim_create` のように**普通の関数として呼べています**。
これが「Node で C を動かす」の実体です。

> **`_`（アンダースコア）の意味**: C の関数は WASM に入るとき名前の頭に `_` が付く
> 決まりになっています。だから JS 側は `M._game_step` と書きます。

---

## 5. ひとつだけ知っておくべき癖 — メモリの受け渡し

JS と C は**メモリの扱いが違う**ため、文字列や配列をやり取りするときだけ
ひと手間かかります。数値（`int` / `double`）はそのまま渡せますが、
**文字列やバッファは「WASM のメモリ上の住所（ポインタ）」で渡す**必要があります。

`record.mjs` で `.cub` のテキスト（文字列）を渡す部分がそれです。

```js
function writeCString(text) {
	const bytes = new TextEncoder().encode(text);
	const ptr = M._malloc(bytes.length + 1);   // WASM のメモリを確保して住所をもらう
	M.HEAPU8.set(bytes, ptr);                  // その住所へ文字列を書き込む
	M.HEAPU8[ptr + bytes.length] = 0;          // C の文字列は末尾 \0 が要る
	return ptr;                                // 住所（ポインタ）を返す
}

const mapPtr = writeCString(mapText);
const game = M._sim_create(mapPtr, 1, ...);    // 住所を渡す
M._free(mapPtr);                               // 使い終わったら解放
```

`M.HEAPU8` は **WASM のメモリを JS から覗く窓**です。
[スナップショットと補間](./スナップショットと補間.md) で「JS が HEAPU8 を読んで Canvas に描く」
と言ったのも、この窓のことです。C が書いた結果を JS がこの窓から読み取ります。

**W-10 の実装では、この writeCString の作法がそのまま使えます。** 難しいのは
最初だけで、`record.mjs` にひな型が揃っています。

---

## 6. native / web / server との対応

同じ C から作った 3 つの成果物が、それぞれどう動くかを整理すると:

| | ビルド | 形式 | 誰が実行する |
|---|---|---|---|
| native | `gcc`（make） | Linux 実行ファイル | OS が直接 |
| web | `emcc`（make web） | `render.wasm` + glue | **ブラウザ**が実行 |
| server | `emcc`（make sim） | `sim.wasm` + glue | **Node** が実行 |

web と server は**同じ WASM の仕組み**で、実行する場所（ブラウザ / Node）が違うだけです。
だから片方（`web/gate1.js`）で分かったことは、もう片方（`record.mjs`）でも通用します。

---

## 7. まとめ

1. **WebAssembly（WASM）= C を「ブラウザ/Node が実行できる形」に翻訳した中間形式**。
2. OS 非依存で、**1 つの `.wasm` がブラウザでも Node でも**ネイティブに近い速さで動く。
3. 翻訳するのは **Emscripten（emcc）**。gcc の代わり。`.wasm` と橋渡しの `glue.js` を吐く。
4. Node は glue を読み込み、**C の関数を `M._関数名(...)` で普通に呼ぶ**。
5. 数値はそのまま、**文字列/配列は WASM メモリの住所（ポインタ）で渡す**。作法は
   `record.mjs` にひな型あり。
6. これで **C のロジックを 1 つに保ったまま**、描画（ブラウザ）と判定（Node）に使える。

---

## 関連資料

- 前提: [3つのビルドターゲット](./3つのビルドターゲット.md)（何を作り分けているか）
- 呼び出しの実例: [web/sim_demo/record.mjs](../../web/sim_demo/record.mjs)（Node → sim.wasm）/ [web/gate1.js](../../web/gate1.js)（ブラウザ → render.wasm）
- 公開 API の正本: [codes/includes/platform/sim.h](../../codes/includes/platform/sim.h)（`sim_create` / `game_step` / `game_snapshot`）
- ビルド設定: [`Makefile`](../../Makefile)（`emcc` と `SIM_LDFLAGS`）
- 関連: [スナップショットと補間](./スナップショットと補間.md)（HEAPU8 の窓） / [ループ反転](./ループ反転-誰がゲームを回しているか.md)（Node が game_step を回す）
