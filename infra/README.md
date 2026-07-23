# infra — nginx 設定・TLS 証明書・compose 用アセット

**W-01 時点では骨格のみ。実体は W-15（Docker Compose + nginx TLS + 単一コマンド起動）で作る。**

## 置くもの（W-15 の作業対象）

| パス | 内容 |
|---|---|
| `nginx/nginx.conf` | HTTPS 終端（自己署名）・静的配信（frontend の build）・`/api` と `/ws` のリバースプロキシ |
| `certs/` | 自己署名証明書（**生成物。git 管理外**）。初回 `docker compose up` で生成する |
| `scripts/` | 証明書生成・Prisma マイグレーション・`make web sim` 相当のアセット変換を起動時に流す入口 |

## 設計の根拠

- 構成（nginx + app + ボリューム）と TLS 方針は [0-全体アーキテクチャ設計](../md_files/02_設計書/0-全体アーキテクチャ設計.md) §2.4・§3.1。
- 受入条件「空フォルダ `git clone` → `docker compose up` → Chrome で HTTPS 接続」は [5-バックログ](../md_files/02_設計書/5-バックログ.md) W-15。
- 既存の `docker-compose.yml` は現状 **Emscripten ビルド用サービス（engine-build）**のみ。W-15 で `nginx` / `app` サービスを追加する。
