#!/bin/sh
set -eu

# 永続化する SQLite ファイルの接続先が無ければ、起動前に明示的に失敗させる
: "${DATABASE_URL:?DATABASE_URL must be set to the persisted SQLite database}"

# migration が失敗した場合は set -e により backend を起動しない
npm run db:deploy

exec "$@"
