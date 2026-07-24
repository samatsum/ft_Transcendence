# cub3D

*本プロジェクトは、42 カリキュラムの一環として samatsum によって作成されました。*

<img align="center" src="md_files/screenshot.png" alt="Screenshot of the game" />

## チーム役割 (Team Roles)

ft_transcendence は 4 名のグループプロジェクトです。課題書 II.1.1 の必須役割を以下に割り当てます。
**1 人が複数役割を兼任でき、全員が開発者**です。

| メンバー | 管理役割 | 開発担当 |
|---|---|---|
| **samatsum** | テクニカルリード / アーキテクト | ゲームサーバー（WS / GameRoom / `sim.wasm` 駆動） |
| **torinoue** | プロジェクトマネージャー / スクラムマスター | バックエンド基盤（Auth / REST / DB / DevOps） |
| **mamiyaza** | プロダクトオーナー | フロント基盤（認証 / ロビー / プロフィール） |
| **hminemur** | 開発者 | フロントゲーム（GameView / HUD / 統合） |

- **テクニカルリード**: アーキテクチャと技術決定、重要変更のレビュー（とくに sim / WS プロトコル境界）。cub3D エンジンの設計・実装を担当。
- **PM / スクラムマスター**: 進捗・期限の追跡、ブロッカー管理、定例の調整。
- **プロダクトオーナー**: 機能の優先順位と完了検証、バックログ管理、評価者との窓口。
- **開発者（全員）**: 実装・コードレビュー・自分の実装のテスト・文書化。

作業の分割・依存・引き継ぎは [チーム分担計画](./md_files/02_設計書/6-チーム分担計画.md) を参照。

## 概要 (Description)

cub3D は、C 言語と MiniLibX（X11）を用いて構築された、レイキャスティング（DDA 法）ベースの一人称 3D レンダリングエンジンです。`Wolfenstein 3D` 系の擬似 3D 表現に、武器切り替え・収集アイテム・扉・**巡回／追跡する敵 AI** といったゲーム要素を追加しています。さらに、同じエンジン上で動く対戦的な遊びとして **RSP モード（じゃんけん鬼ごっこ）** を備えています。

### 2 つのモード

- **FPS モード**: `./cub3D maps/fps_map/<map.cub>` — 敵を避け／倒し、収集アイテムを集めて扉を開く一人称探索。
- **RSP モード**: `./cub3D maps/rsp_map/<map.cub>` — プレイヤー（赤チーム）と NPC が赤・青に分かれ、接触時の **じゃんけん** で勝敗を決める鬼ごっこ。負けた側は即リスポーン。

モードはマップの配置ディレクトリで自動判定されます。第 2 引数は指定しません。

主な機能:

- DDA レイキャスティングによる壁描画、距離に応じた陰影（シェード）
- テクスチャ付きの床・天井（未指定時は単色フォールバック）
- 距離ソート付きのスプライト描画（障害物・装飾・収集アイテム・敵）
- **オブジェクトは 3 カテゴリ × 最大 5 種**（通行不可 / 通行可 / 収集）まで個別テクスチャを割り当て可能
- 8 方向スプライトで描画される敵 AI。**巡回路（`P`）を右手法則で周回し、正面視野＋視線判定でプレイヤーを検知すると追跡**（HP・追跡タイマー付き）
- **収集アイテムをすべて集めると開く扉**（マップ文字 `D`）
- FPS モード専用の武器切り替え（ピストル / フラッシュライト / 素手）と射撃
- ミニマップ・収集進捗・クロスヘアの ON/OFF
- **移動速度・回転速度・FOV・敵の追跡秒数・敵の移動速度・敵の HP を `.cub` から実行時に調整可能**
- **RSP モード（じゃんけん鬼ごっこ）**: チーム制。手は接触時に自動でじゃんけん判定され、自陣スポーンを踏むと手が変わる

### アーキテクチャ概略

```
                        [ User Input (X11 keyboard) ]
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────┐
│                            Main Loop (mlx)                         │
│                                                                    │
│   Input (WASD/Arrows)  ─► Camera/World update ─► Renderer          │
│       │                          │                   │             │
│       ▼                          ▼                   ▼             │
│   t_input        t_camera / t_world (敵AI含む)  t_render (screen)  │
│                                                                    │
└───────────────────────────────────────────────┬────────────────────┘
                                                 │
                                                 ▼
                                    Window (X11) via MiniLibX
```

FPS モードの敵 AI は毎フレーム「索敵 → 巡回 or 追跡 → 移動」を実行します。RSP モードでは敵 AI が「最寄りの異チーム戦闘員を見て、勝てる手なら追跡・負ける手なら逃走・あいこは徘徊」に切り替わります。詳細は [DEV_DOC.md](./md_files/04_エンジン資料/開発ドキュメント.md) §3（FPS）／§4（RSP）を参照してください。

## 動作要件

- Linux（X11）
- `gcc`, `make`
- 開発ヘッダ: `xorg`, `libxext-dev`, `libbsd-dev`

Debian/Ubuntu 系での導入例:

```
sudo apt-get install gcc make xorg libxext-dev libbsd-dev
```

## ビルドと実行

```
make
./cub3D maps/fps_map/1.cub      # FPS モード
./cub3D maps/rsp_map/rsp.cub    # RSP モード（じゃんけん鬼ごっこ）
```

ビルドは `-O2 -Wall -Wextra -Werror`（インクルードパスは `codes/includes`）で行われます。`make debug`（AddressSanitizer 付き）・`make check`（失敗すべき lint ゲート）・`make audit`（助言系を含む全 lint）・`make clean` / `make fclean` / `make re` も利用できます。

### Web / WASM ビルド（Docker 推奨）

ローカル PC に `emsdk` を置く場所は固定しません。Web 版をビルドする場合は、Docker 経由で同じ Emscripten 環境を使うのが推奨です。

```
docker compose up --build
```

ビルド完了後、ブラウザで `http://localhost:8000/web/engine_demo.html` を開くと、生成された `web/build/render.js` と `web/assets/` を使って動作確認できます。停止は `Ctrl-C` です。Linux/WSL で生成ファイルの所有者を自分に合わせたい場合だけ、`HOST_UID=$(id -u) HOST_GID=$(id -g) docker compose up --build` のように指定します。ローカルに Emscripten を入れている場合は、`emsdk_env.sh` を source してから通常どおり `make web` / `make sim` してください。

#### ブラウザで遊ぶ（`engine_demo.html`）

`engine_demo.html` は **ブラウザ上でエンジンを 1 人で動かす動作確認ページ**です（オンライン 2vs2 対戦は W-10 以降の実装で、まだ動きません）。Emscripten をローカルに入れている場合は、Docker を使わず次の 2 手順でも起動できます。

```
make web                                    # web/build/render.js と web/assets/ を生成
python3 -m http.server 8000                 # リポジトリのルートで配信（file:// では動かない）
```

そのうえでブラウザで `http://localhost:8000/web/engine_demo.html` を開きます。

**マップと解像度は URL クエリで選べます**（`maps/` 配下のパスを指定）。

```
http://localhost:8000/web/engine_demo.html                                   # 既定（FPS: maps/fps_map/1.cub）
http://localhost:8000/web/engine_demo.html?map=rsp_map/rsp.cub               # RSP モード
http://localhost:8000/web/engine_demo.html?map=fps_map/fps_duel.cub          # FPS 対戦マップ
http://localhost:8000/web/engine_demo.html?res=1280x720                      # 内部解像度を指定（既定 960x540）
http://localhost:8000/web/engine_demo.html?map=rsp_map/rsp.cub&res=848x480   # 併用
```

- `?map=` は `maps/` からの相対パス。`rsp_map/` 配下を指定すると RSP モード、`fps_map/` 配下は FPS モードになります（配置ディレクトリでモードが決まる）。
- `?res=` は内部描画解像度。重い環境は `848x480` に下げると軽くなります（表示サイズは CSS で拡大され不変）。範囲は C 側で `848x480`〜`1920x1080` にクランプされます。
- 操作は下の [操作 (Controls)](#操作-controls) と同じです。加えて、**Canvas をクリックすると視点操作が有効化**され、`Esc` で解除されます。フッターに実解像度と fps が表示されます。

### Web アプリ（backend / frontend）

オンライン対戦の Web アプリは npm workspaces のモノレポで、`app/` 配下にまとまっています（`app/backend/` `app/frontend/` `app/shared/`）。Node.js 20 以上が必要です。

```
npm install                # 3 ワークスペースをまとめて導入（初回のみ）
npm run dev:backend        # Fastify を :3000 で起動
npm run dev:frontend       # Vite を :5173 で起動（/api は :3000 へプロキシ）
```

ブラウザで `http://localhost:5173` を開くと `/api/health` の疎通結果が表示されます。`npm run typecheck` で 3 ワークスペースの型検査、`npm run build` で本番ビルドを行います。ポートは `.env.example` の `BACKEND_PORT` / `FRONTEND_PORT` で変更できます。

| ディレクトリ | 内容 |
|---|---|
| `app/backend/` | Fastify + TypeScript。REST API・WS ゲートウェイ・GameRoom（`sim.wasm`）の置き場 |
| `app/frontend/` | React + Vite + TypeScript + Tailwind の SPA |
| `app/shared/` | FE/BE 共有の zod スキーマ（型の単一情報源） |
| `infra/` | nginx 設定・TLS 証明書・`docker/`（Dockerfile。実体は今後追加） |

## 操作 (Controls)

| 入力 | 動作 |
|---|---|
| `W` / `S` | 前進 / 後退 |
| `A` / `D` | 左右に平行移動（ストレイフ） |
| `←` / `→` | 視点を左右に回転 |
| `1` / `2` / `3` | 武器切り替え（ピストル / フラッシュライト / 素手、**FPS モード専用**） |
| `Space` | 射撃（ピストル装備時のみ、クールダウンあり。**FPS モード専用**） |
| `I` | UI（ミニマップ・進捗表示）の表示切替 |
| `O` | クロスヘア（照準）の表示切替 |
| `L` | 距離に応じた影付きシェーディングの切替 |
| `Esc` または ウィンドウの × | 終了 |

> **注:** 移動は WASD、回転は左右矢印のみです（上下矢印・Q・E は未割り当て）。**RSP モードでは `1` / `2` / `3` / `Space` は無効** で、武器切り替え・射撃はできません。じゃんけんは戦闘員どうしの接触時に自動で判定されます。

## マップ仕様

cub3D は `.cub` ファイルで解像度・テクスチャ・色・各種パラメータ・マップ本体を記述します。FPS 用マップは `maps/fps_map/`、RSP 用マップは `maps/rsp_map/` に置き、配置ディレクトリでモードを判定します。オブジェクトは 3 カテゴリ × 最大 5 種まで個別テクスチャを指定でき、移動速度・敵パラメータなどは `.cub` から上書きできます。主なマップ文字は `M`（敵の出現地点）・`P`（敵が周回する巡回路）・`D`（収集完了で開く扉）・`N/S/E/W`（プレイヤー初期位置と向き）です。RSP モードでは `N/W`（赤チーム）と `S/E`（青チーム）のスポーンを **各チーム 2 地点以上** 用意します。詳しい記述ルールは [USER_DOC.md](./md_files/04_エンジン資料/ユーザードキュメント.md) を参照してください。

## ドキュメント

- 👉 **[USER_DOC.md](./md_files/04_エンジン資料/ユーザードキュメント.md)** — プレイヤー／評価者向け。起動方法、操作、RSP モードの遊び方、`.cub` の記述ルール（敵・巡回路・扉・各種パラメータを含む）。
- 👉 **[DEV_DOC.md](./md_files/04_エンジン資料/開発ドキュメント.md)** — 開発者向け。モジュール構造（common / fps / rsp の 3 系統）、敵 AI と RSP AI の詳細、データフロー、チューニング値、結果スクリーンショット、付属の lint ツール。
- 👉 **[CODING_RULES.md](./md_files/04_エンジン資料/コーディング規約.md)** — C コーディングルールの正本。`make check` の `CRxxx` 表示はここに対応。

## 参考資料 (Resources)

- [Lode's Computer Graphics Tutorial — Raycasting](https://lodev.org/cgtutor/raycasting.html)
- [A first-person engine in 265 lines (PlayfulJS)](http://www.playfuljs.com/a-first-person-engine-in-265-lines/)
- [42Paris / minilibx-linux](https://github.com/42Paris/minilibx-linux)
- [BMP format reference](https://stackoverflow.com/questions/2654480/writing-bmp-image-in-pure-c-c-without-other-libraries)
