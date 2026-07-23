# `pf_` プレフィックス関数について

**対象**: チームメンバー全員（C を読まない人も、§1〜§3 だけ読めば分かるように書いています）
**一言でいうと**: **同じ C のコードを、Linux アプリ・ブラウザ・Node サーバの 3 か所で
動かすための「つなぎ目」**です。`pf` は **platform** の略です。

---

## 1. なぜ必要だったのか

### 元の状態

cub3D は 42 の課題で、**MiniLibX（MLX）というライブラリ**を使って画面を出しています。
MLX は Linux の X11（デスクトップの画面表示の仕組み）を前提にしたライブラリです。

```c
mlx_init();                    // MLX を初期化
mlx_new_window(...);           // ウィンドウを開く
mlx_put_image_to_window(...);  // 画面に絵を出す
```

### 何が困るのか

私たちがやりたいのは次の 3 つです。

| どこで動かす | 画面 | MLX は使えるか |
|---|---|---|
| Linux のデスクトップ（従来の cub3D） | X11 のウィンドウ | ✅ 使える |
| **ブラウザ** | HTML の `<canvas>` | ❌ **使えない**（X11 が無い） |
| **Node サーバ**（対戦の判定役） | **画面そのものが無い** | ❌ 使えない |

つまり、**ゲームのロジック（移動・当たり判定・じゃんけんの勝敗・スコア）は 3 か所で
まったく同じものを使いたいのに、画面まわりだけが 3 か所で全部違う**わけです。

### 素直にやると起きること

ここで何も工夫しないと、ゲームのロジックを **3 回書くこと**になります。

- ブラウザ用に TypeScript で書き直す
- サーバ用にもう一度書く
- 元の C も残す

これをやると「サーバでは勝ちだったのにブラウザでは負けに見える」といった、
**3 つの実装がズレるバグ**が必ず出ます。しかも直すときは 3 か所直す必要があります。

---

## 2. `pf_` が解決したこと

そこで、**「MLX に触る処理」だけを 10 個の関数に押し込めて、名前を `pf_` で統一**しました。

```
        ゲームのロジック（移動・衝突・敵AI・じゃんけん・スコア）
                    ↑ ここは 1 つだけ。3 か所で共通 ↑
                             │
                    pf_* を呼ぶ（ここが境界）
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
   pf_* の実装A          pf_* の実装B          pf_* の実装C
   （MLX を使う）      （Canvas を使う）      （何もしない）
        ▼                    ▼                    ▼
   Linux アプリ           ブラウザ            Node サーバ
```

**ゲームのロジックは「`pf_present()` を呼べば画面に出る」としか知りません。**
その中身が MLX なのか Canvas なのか、何もしないのかは知らないし、知る必要もない。

これが `pf_` の正体です。特別な技術ではなく、**「差し替えたい部分だけを関数の名前で
くくり出した」**というだけのものです。

---

## 3. 10 個の関数

正本は [`codes/includes/platform/platform.h`](../../codes/includes/platform/platform.h) です。

| 関数 | 役割 | Linux（native） | ブラウザ（web） | サーバ（headless） |
|---|---|---|---|---|
| `pf_init` | 描画先の用意 | MLX 初期化 + ウィンドウを開く | Canvas は JS 側が持つのでサイズだけ控える | **何もしない** |
| `pf_create_framebuffer` | 絵を描くメモリを確保 | `mlx_new_image` | WASM ヒープ上に確保 | **確保しない**（描かないので） |
| `pf_present` | 描いた絵を画面へ出す | `mlx_put_image_to_window` | JS が WASM メモリを読んで Canvas へ | **何もしない** |
| `pf_now_ms` | 現在時刻（ミリ秒） | `gettimeofday` | ブラウザの時計 | システム時計 |
| `pf_load_texture` | 画像を読み込む | XPM ファイルを読む | 事前変換済み RGBA を渡す | **1x1 のダミーを返す** |
| `pf_destroy_texture` | 画像を解放 | `mlx_destroy_image` | メモリ解放 | メモリ解放 |
| `pf_poll_events` | キー入力を拾う | X11 のキーイベント | JS のキーイベント | **何もしない**（入力は通信で来る） |
| `pf_setup_hooks` | イベント登録 | `mlx_hook` ×4 | JS 側が持つ | **何もしない** |
| `pf_loop` | イベントループ開始 | `mlx_loop`（ここで実行が止まる） | `requestAnimationFrame` が回す | **何もしない**（サーバの tick が回す） |
| `pf_shutdown` | 後始末 | `mlx_destroy_*` 一式 | メモリ解放 | メモリ解放 |

### 「何もしない」が多いことに注目してください

サーバ版（headless）は **半分が「何もしない」**です。これは手抜きではなく**設計どおり**です。

サーバは絵を描く必要がありません。画面も無いし、キーボードも無い。
でも**移動・衝突・じゃんけんの勝敗判定は完全に同じものを使いたい**。

そこで「描画まわりは全部空っぽの実装を用意する」ことで、
**ゲームのロジック側は 1 行も分岐せずに**サーバでも動くようになります。

```c
// ゲームのロジックはこう書いてある（3 環境で共通、if 文なし）
pf_present(&game->window);   // Linux: 画面に出る / ブラウザ: Canvas に出る / サーバ: 何も起きない
```

もし `pf_` が無ければ、ここに
`if (サーバなら描画しない)` という分岐が**コードのあちこちに**入ることになります。

### なぜ「headless」？　「server」じゃないの？

**headless（ヘッドレス）は「頭が無い」という意味の一般的な業界用語**で、
ここでの head は**ディスプレイ**を指します。モニタもキーボードもマウスも繋がっていない
コンピュータのことを headless computer と呼ぶのが元です。
同じ用法で headless browser（Chrome の画面なしモード）、headless CMS などがあります。

> 用語の解説: [ヘッドレスとは（e-Words）](https://e-words.jp/w/%E3%83%98%E3%83%83%E3%83%89%E3%83%AC%E3%82%B9.html)

`platform/server` にしなかった理由は 3 つあります。

**1. 層の名前は「何であるか」を表すべきで、「何に使うか」ではないから**

`platform/` の 3 つは、実行環境の性質で並んでいます。
ここに `server` を混ぜると、2 つが「環境」で 1 つだけ「役割」になり、軸がずれます。

| 実装 | 性質 |
|---|---|
| `native` | OS のデスクトップ上（X11 がある） |
| `web` | ブラウザの中（Canvas がある） |
| `headless` | **画面が無い** |

**2. 実際、サーバ以外でも使っているから**

これが決定的な理由です。`make test`（85 検査の受入テスト）は、この headless 実装を含んだ
**ただのネイティブ実行ファイル**を gcc でビルドして走らせています。
サーバでもなければ wasm でもありません。

```bash
make test          # codes/tests/sim_test が platform_headless.c を含んでいる
```

デモ記録用の `web/sim_demo/record.mjs`（CLI スクリプト）も同じ層を使っています。
もし `server` という名前だったら、「なぜテストがサーバ実装をリンクしているのか」という
不要な疑問が毎回発生します。

**3. サーバであることは、この層の関心事ではないから**

headless 実装がやっているのは「描画しない・入力を拾わない・ループを持たない」の 3 つだけで、
**誰がその上で tick を回すかを知りません**。
回すのが Fastify でも、テストの `for` ループでも、`record.mjs` でも同じように動きます。

紛らわしいので、言葉の対応を整理しておきます。

| 語 | 指すもの |
|---|---|
| **headless** | プラットフォーム層の実装（`platform_headless.c`）。「画面が無い」という性質 |
| **`sim.wasm`** | headless 実装を含めてビルドした成果物 |
| **サーバ / GameRoom** | `sim.wasm` を 30Hz で回す Node 側のコード（W-10。**まだ未実装**） |

**「headless だからサーバ」ではなく、「headless だからサーバでも動かせる」**という順序です。

---

## 4. 実際どこにあるのか

MLX を使う実装は **1 ファイルだけ**に閉じ込めてあります。

| ファイル | 行数 | 中身 |
|---|---|---|
| [`platform/native/platform_native.c`](../../codes/srcs/platform/native/platform_native.c) | 160 | **MLX を使う唯一のファイル** |
| [`platform/web/platform_web.c`](../../codes/srcs/platform/web/platform_web.c) | 280 | ブラウザ版（Canvas / RGBA テクスチャ登録） |
| [`platform/headless/platform_headless.c`](../../codes/srcs/platform/headless/platform_headless.c) | 144 | サーバ版（ほぼ「何もしない」） |

**確認してみてください。** リポジトリのルートで、
「`mlx.h` を include している」か「`mlx_◯◯()` を呼んでいる」ファイルを探します。

```bash
grep -rln 'mlx\.h\|mlx_[a-z]' codes/srcs
```

`codes/srcs/platform/native/platform_native.c` の **1 行しか出ません**。
つまり `codes/srcs/common/`（ゲームのロジック本体）は、**MLX を一切呼んでいません**。


### 呼ぶ側は、どうやって native / headless を指定しているのか

**指定していません。** これが一番よく聞かれる点なので、先に答えを書きます。

3 つのファイルは、**まったく同じ 10 個の関数名**を定義しています。

```c
// platform_native.c
void pf_present(t_window* w) { mlx_put_image_to_window(...); }   // 画面に出す

// platform_web.c
void pf_present(t_window* w) { /* JS が HEAPU8 を読んで Canvas へ */ }

// platform_headless.c
void pf_present(t_window* w) { (void)w; }                        // 何もしない
```

呼ぶ側（`loop.c`）は、ただこう書いてあるだけです。

```c
pf_present(&game->window);
```

**`if` も `#ifdef` も関数ポインタもありません。**
Makefile がターゲットごとに 1 つしかソースを渡していないので、
**リンカが「その場にある `pf_present`」に解決する**だけです。選択の余地がありません。

| コマンド | 生成物 | 渡す `pf_*` 実装 | Makefile の変数 |
|---|---|---|---|
| `make` | `cub3D`（Linux アプリ） | `platform_native.c` | `NATIVE_PLATFORM_SRCS` |
| `make web` | `render.wasm`（ブラウザ） | `platform_web.c` | `WEB_PLATFORM_SRCS` |
| `make sim` | `sim.wasm`（サーバ用） | `platform_headless.c` | `SIM_PLATFORM_SRCS` |
| `make test` | `sim_test`（受入テスト） | `platform_headless.c` | 同上（`SIM_SRCS` を流用） |

2 つ混ぜれば `duplicate symbol`、0 個なら `undefined reference` でリンクが落ちます。
**間違えようがない**のが、この方式の一番の利点です。

C で実装を差し替えるときの最も古典的なやり方で、特別な技術は使っていません。

**ゲームロジックのソースは 4 つとも同じものを使っています。** 違うのは `pf_*` の実装だけです。

### もう一段の節約：sim は描画のコードごと入っていない

`make sim` はさらに、**描画のソースコード自体をリンク対象から外して**います
（Makefile の `SIM_RENDER_EXCLUDES`）。
`draw.c` / `raycast.c` / `sprite.c` / `font.c` などは `sim.wasm` に含まれていません。

だから headless の `pf_create_framebuffer` は「メモリを確保しない」で済みます。
**描く人がそもそも居ない**からです。

### 正確を期すと：`#ifdef` は 2 箇所だけある

「分岐は一切ない」と言い切ると少し不正確なので補足します。
コードベース全体で条件コンパイルは **2 箇所だけ**です。

| 場所 | 何のため |
|---|---|
| `engine/render/cast_columns.c` | native は pthread で並列描画、web は単一スレッド |
| `core/loop.c` | ブラウザでは計測用の `printf` を出さない（「コンソール警告ゼロ」要件のため） |

どちらも **pthread と計測ログの都合**であって、`pf_*` の選択とは無関係です。
`pf_*` に関しては、本当に分岐ゼロです。

---

## 5. 壊さないために守ること

> **原則: `codes/srcs/common/`（と `fps/` `rsp/`）に MLX を持ち込まない。**

もし `common/` のどこかに `#include "mlx.h"` を書いてしまうと、
**`make web` と `make sim` がコンパイルエラーで落ちます**（ブラウザ用・サーバ用のビルドには
MLX のヘッダが存在しないため）。

これは事故ではなく、**わざとそうなるように作ってある安全装置**です。
CI（GitHub Actions）が毎回 3 つとも全部ビルドするので、この退行は必ず検知されます。

なお、`make check`（lint）にはこれを検査する項目は**ありません**。検知しているのは
**ビルドそのもの**です。「lint が通ったから大丈夫」ではなく「3 ターゲットのビルドが
通ったから大丈夫」と考えてください。

---

## 6. Backend / Frontend 担当への実務的な影響

**結論から言うと、`pf_*` を直接呼ぶ機会はほぼありません。** 知っておくべきはこれだけです。

### samatsum（ゲームサーバ / W-10・W-11）

- `sim.wasm` を Node で動かすとき、**中では headless 版の `pf_*` が使われています**。
  「描画しない・入力を拾わない・ループを持たない」実装なので、
  **tick を回すのは Node の責務**です（`setInterval` で `game_step` を呼ぶ）。
- 呼ぶのは `pf_*` ではなく **sim 公開 API**（`sim_create` / `sim_set_input` /
  `game_step` / `game_snapshot`）です。`pf_*` はその下で勝手に動いています。

### hminemur（フロントゲーム / F-06）

- ブラウザでは **`pf_present` が「JS が WASM メモリを読んで Canvas に描く」**という形に
  なっています。つまり **C 側は絵をメモリに書くだけで、Canvas に出すのは JS の仕事**です。
- そのため `web_framebuffer_ptr()` などで**バッファの場所を JS から取得**します。
  この配線は [`web/sim_demo/replay.html`](../../web/sim_demo/replay.html) に動く実例があるので、
  F-06 はそれを下敷きにできます。

### torinoue / mamiyaza

- 直接の関わりはありません。「C のロジックが 3 環境で共通なのは `pf_*` のおかげ」
  ということだけ頭に置いておけば十分です。

---

## 7. まとめ

1. **`pf_` = platform。MLX に触る処理だけを 10 個の関数にくくり出したもの。**
2. 目的は**ゲームロジックを 1 つに保つこと**。3 回書けば 3 つズレるので、それを避けた。
3. 実装は 3 つ（native / web / headless）あり、**Makefile がビルド時に差し替える**。
   呼ぶ側は選んでいない。**リンクされた 1 つに解決されるだけ**。
4. **headless =「画面が無い」という性質**。サーバ専用ではなく、`make test` でも使っている。
5. サーバ版は半分が「何もしない」。**それが正しい姿**。
6. `common/` に MLX を持ち込むと `make web` / `make sim` が落ちる。**それが安全装置**。

---

## 関連資料

- 設計の正本: [1-エンジン分離設計 §2](../02_設計書/1-エンジン分離設計.md)（`pf_*` の仕様表と設計判断）
- ヘッダ: [`codes/includes/platform/platform.h`](../../codes/includes/platform/platform.h)
- ビルドの実体: [`Makefile`](../../Makefile)
  （`NATIVE_PLATFORM_SRCS` / `WEB_PLATFORM_SRCS` / `SIM_PLATFORM_SRCS`）
- 実装した経緯: [1-ゲート1レポート](../03_実装レポート/1-ゲート1レポート.md)（E-01〜E-07）
- 現行実装の全体像: [開発ドキュメント](../04_エンジン資料/開発ドキュメント.md)
- 用語「ヘッドレス」: [e-Words](https://e-words.jp/w/%E3%83%98%E3%83%83%E3%83%89%E3%83%AC%E3%82%B9.html)
