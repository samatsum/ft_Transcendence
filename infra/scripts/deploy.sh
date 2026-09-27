#!/bin/sh
# VPS 上で実行する更新スクリプト（#138）。手元からは次の一行で叩く:
#
#   ssh -i ~/.ssh/linode_ft root@<IP> 'cd /opt/ft_transcendence && infra/scripts/deploy.sh'
#
# 既定では origin/main へ追従する。別のブランチを試すときは DEPLOY_REF で指定する:
#
#   DEPLOY_REF=feat/138-linode-deploy infra/scripts/deploy.sh
#
# **`git reset --hard` するので、サーバー側の変更は捨てられる。** `.env` は
# git 管理外なので残る。
set -eu

ref=${DEPLOY_REF:-main}
compose="docker compose -f docker-compose.yml -f docker-compose.vps.yml"

cd "$(dirname "$0")/../.."

if [ ! -f .env ]; then
	echo "エラー: .env がない。SERVER_NAME と ALLOWED_ORIGIN を書くこと（infra/README.md 参照）" >&2
	exit 1
fi

git fetch -q origin "$ref"
before=$(git rev-parse HEAD)
after=$(git rev-parse "origin/$ref")
branch=$(git rev-parse --abbrev-ref HEAD)

# **ブランチ名まで $ref に揃える。** `git reset --hard origin/main` だけだと
# 中身は main でもローカルのブランチ名は前のまま残り、`git status` が
# 実態と食い違う。-f はローカルの変更を捨てる（.env は git 管理外なので残る）
switch_to_ref() {
	git checkout -q -f -B "$ref" "origin/$ref"
}

# **変更が無ければビルドしない。** このサーバー（Nanode 1GB）では wasm の
# ビルドに20分近くかかるので、無駄な作り直しを避ける。強制するなら DEPLOY_FORCE=1
if [ "$before" = "$after" ] && [ "${DEPLOY_FORCE:-}" != 1 ]; then
	if [ "$branch" != "$ref" ]; then
		switch_to_ref
		echo "内容は同じ。ブランチ名だけ $branch -> $ref に揃えた（ビルドはしない）"
	else
		echo "変更なし（$ref = $(git log -1 --format='%h %s' HEAD)）。何もしない"
	fi
	exit 0
fi

echo "=== $before -> $after へ更新"
git log --oneline "$before..$after" 2>/dev/null | head -20 || true
switch_to_ref

echo "=== ビルドと再起動"
$compose up -d --build
# **nginx は必ず再起動する。** nginx は起動時に upstream（backend）を名前解決して
# IP を掴み続ける。backend だけ作り直されると新しいコンテナは別の IP になり、
# nginx は古い IP へ送り続けて 502 になる（2026-09-26 に実際に起きた）
$compose restart nginx

echo "=== 疎通確認"
# SERVER_NAME は .env にある。読み出しに sourcing を使わないのは、
# .env のコメントや引用符をシェルに解釈させないため
server_name=$(sed -n 's/^SERVER_NAME=//p' .env | tr -d '"'"'"' ' | head -1)
if [ -z "$server_name" ]; then
	echo "警告: .env から SERVER_NAME を読めなかった。疎通確認は省略する" >&2
else
	# nginx の起動直後は healthcheck が通る前に叩いてしまうので、少し待つ
	i=0
	while [ "$i" -lt 30 ]; do
		code=$(curl -s -o /dev/null -w '%{http_code}' "https://$server_name/api/health" || true)
		[ "$code" = 200 ] && break
		i=$((i + 1))
		sleep 2
	done
	echo "https://$server_name/api/health -> ${code:-応答なし}"
	[ "$code" = 200 ] || exit 1
fi

# **掃除は必須。** ディスクは 25GB しかなく、ビルドのたびに数GB増える。
# 動いているコンテナが使っているイメージは消えない
echo "=== 不要なイメージとビルドキャッシュを削除"
docker image prune -f >/dev/null
docker builder prune -f --keep-storage 2g >/dev/null 2>&1 || docker builder prune -f >/dev/null
df -h / | tail -1

echo "=== 完了: $(git log --oneline -1)"
