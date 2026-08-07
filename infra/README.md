# infra — nginx 設定・TLS 証明書・compose 用アセット

**W-01 時点では骨格のみ。実体は W-15（Docker Compose + nginx TLS + 単一コマンド起動）で作る。**

## 置くもの（W-15 の作業対象）

| パス | 内容 |
|---|---|
| `docker/` | Dockerfile 置き場。現状は `docker/engine-build/`（Emscripten ビルド用）。ルート直下から移設（②の整理） |
| `nginx/nginx.conf` | HTTPS 終端（自己署名）・静的配信（frontend の build）・`/api` と `/ws` のリバースプロキシ |
| `certs/` | 自己署名証明書（**生成物。git 管理外**）。初回 `docker compose up` で生成する |
| `scripts/` | 証明書生成・Prisma マイグレーション・`make web sim` 相当のアセット変換を起動時に流す入口 |

## 設計の根拠

- 構成（nginx + app + ボリューム）と TLS 方針は [architecture.md](../docs/ai/architecture.md) §2.4・§3.1。
- 受入条件「空フォルダ `git clone` → `docker compose up` → Chrome で HTTPS 接続」は [backlog.md](../docs/ai/backlog.md) W-15。
- 既存の `docker-compose.yml` は現状 **Emscripten ビルド用サービス（engine-build）**のみ。W-15 で `nginx` / `app` サービスを追加する。

## ⚠ W-15 で落としやすい点（2026-07-27・TL 追記）

**`emcc` はホストに入っていない前提で組むこと。**

`web/build/`（`sim.wasm` / `render.wasm`）は git 管理外の生成物で、`make web sim` が Emscripten を必要とします。
開発機に emsdk が入っていると気づきませんが、**評価者のマシンには入っていません**。
空フォルダ `git clone` → `docker compose up` で `web/build/` が空のまま app が起動すると、
**対戦画面が一切描画されずゲート2 相当の機能が死にます**。

- 既存の `engine-build` サービスが `make web sim` を実行する形になっているので、これを起動経路へ組み込む。
- 受入確認は必ず **`rm -rf web/build/` してから** `docker compose up` を通すこと。
- 生成物がホスト側で **root 所有にならないこと**。`docker-compose.yml` の `user:` は `HOST_UID`/`HOST_GID` を参照する（既定は 0:0 = root）。
  セットアップ手順: `.env.example` を `.env` にコピーし、`HOST_UID=$(id -u)` / `HOST_GID=$(id -g)` のコメントを外す。
  受入確認: `docker compose up` 後に `ls -ln web/build/` で UID/GID がホストユーザーと一致することを検証する。

参考: 2026-07-27 に samatsum の開発機で `make sim` が `emcc: No such file or directory` で失敗した。
CI が green なのは `wasm` ジョブが `emscripten/emsdk` コンテナ内で走っているためで、ホスト環境は検査されていない。
