# infra — nginx 設定・TLS 証明書・compose 用アセット

**I-15（Docker Compose + nginx TLS + 単一コマンド起動）で実装済み。** `docker compose up` 一発で
`engine-build`（WASM 生成）→ `frontend`（Vite ビルド）→ `backend` / `nginx`（TLS 終端・REST/WS
プロキシ）の順に起動する。

## 置くもの

| パス | 内容 |
|---|---|
| `docker/` | Dockerfile 置き場。現状は `docker/engine-build/`（Emscripten ビルド用）。ルート直下から移設（②の整理） |
| `docker/nginx/nginx.conf.template` | HTTPS 終端・静的配信（frontend の build）・`/api` と `/ws` のリバースプロキシ。`entrypoint.sh` が `${SERVER_NAME}` `${TLS_CERT}` `${TLS_KEY}` を埋めて `/etc/nginx/nginx.conf` を書き出す（既定は `localhost` + 自己署名） |
| `certs/` | 自己署名証明書（**生成物。git 管理外**）。初回 `docker compose up` で生成する |
| `scripts/` | 証明書生成・Prisma マイグレーション・`make web sim` 相当のアセット変換を起動時に流す入口 |

## VPS へのデプロイ（#138 の遠隔プレイ実測用）

**ローカルの `docker compose up` は従来どおり。** 公開サーバーで要る差分だけを
`docker-compose.vps.yml` に閉じ込めてある（80 番の公開・ホスト名・正式な証明書・`restart`）。

この手順は 2026-09-19 に Linode（Nanode 1GB / Tokyo / Ubuntu 24.04）で実行して確認した。

### 1. サーバーの準備

Docker と Compose を入れ、**スワップを足す**（1GB のままだと wasm のビルドでメモリが足りなくなる）。

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

SSH は鍵のみにし（`PasswordAuthentication no`）、ファイアウォールは受信 22 / 80 / 443 だけ開ける。
80 番は次の証明書取得に要る。

### 2. 証明書の取得

ホスト名は [nip.io](https://nip.io) を使えば登録が要らない——`<IP をハイフン区切りにしたもの>.nip.io`
がその IP に解決する。DNS の設定は不要。

```bash
apt-get install -y certbot
# nginx を起動する前に実行する（80 番を certbot が使う）
certbot certonly --standalone --agree-tos --register-unsafely-without-email \
  -d <IP をハイフン区切りにしたもの>.nip.io
```

**証明書の有効期間は 90 日。** レビュー期間中だけ動かして削除する前提なので、更新の仕組みは用意していない。
`--standalone` で取った都合上、certbot が自動登録する更新タスクは **nginx が 80 番を握っている間は失敗する**。
90 日を超えて運用するなら `--webroot -w`（`docker-compose.vps.yml` が `/var/www/certbot` を
マウント済み）へ切り替えること。

### 3. 起動

```bash
git clone --branch <ブランチ> https://github.com/samatsum/ft_Transcendence.git /opt/ft_transcendence
cd /opt/ft_transcendence
cat > .env <<'EOF'
SERVER_NAME=<IP をハイフン区切りにしたもの>.nip.io
ALLOWED_ORIGIN=https://<IP をハイフン区切りにしたもの>.nip.io
EOF
docker compose -f docker-compose.yml -f docker-compose.vps.yml up -d --build
```

**`ALLOWED_ORIGIN` は完全一致で1つだけ。** ホスト名を変えたら両方を書き換えて `up -d` をやり直す。
フロントは `window.location.host` から WS の URL を組み立てるので、ホスト名を埋めたビルドし直しは要らない。

### 4. マージ後の更新

`infra/scripts/deploy.sh` がサーバー側で完結する。手元からは ssh 一行で叩く。

```bash
ssh -i ~/.ssh/<鍵> root@<IP> 'cd /opt/ft_transcendence && infra/scripts/deploy.sh'
```

既定は `origin/main` への追従。**差分が無ければ何もせず終了する**（Nanode 1GB では
wasm のビルドに20分近くかかるため）。強制するなら `DEPLOY_FORCE=1`、別のブランチを
試すなら `DEPLOY_REF=<ブランチ>` を頭に付ける。

`/api/health` が 200 になるまで最大60秒待ち、駄目なら終了コード 1 で落ちる。
最後に `docker image prune` と `docker builder prune` を実行する——**掃除しないと
ディスク（25GB）がビルド数回で埋まる**。

## 設計の根拠

- 構成（nginx + app + ボリューム）と TLS 方針は [architecture.md](../docs/ai/architecture.md) §2.4・§3.1。
- 受入条件「空フォルダ `git clone` → `docker compose up` → Chrome で HTTPS 接続」は [backlog.md](../docs/ai/backlog.md) I-15。
- `docker-compose.yml` には `nginx` / `backend` / `frontend` / `engine-build` の4サービスがある。`app` という単一サービスにはまとめず、レーンごとに分けている。

## ⚠ I-15 で落としやすい点（2026-07-27・TL 追記）

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
