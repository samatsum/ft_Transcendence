#!/bin/sh
set -eu

https_port=${HTTPS_PORT:-443}
base_url="https://localhost:$https_port"
ca_cert=${TLS_CA_CERT:-infra/certs/ca.crt}
server_cert=${TLS_SERVER_CERT:-infra/certs/localhost.crt}

# 2つの公開証明書(CA とサーバー用)の存在を確認
if [ ! -s "$ca_cert" ] || [ ! -s "$server_cert" ]; then
	echo "TLS certificates are missing; start the nginx service first" >&2
	exit 1
fi

# localhost 証明書がローカル CA によって署名されていることを確認
openssl verify -CAfile "$ca_cert" "$server_cert" >/dev/null
# 証明書の SAN または CN が localhost に対応していることを確認
openssl x509 -in "$server_cert" -noout -checkhost localhost >/dev/null

# REST API の確認
# --cacert でローカル CA を信頼し、nginx 経由の health endpoint を取得
health=$(curl --fail --silent --show-error --cacert "$ca_cert" \
	"$base_url/api/health")
# HTTP 200 だけでなく、backend が期待する status を返すことも確認
if ! printf '%s' "$health" | grep -q '"status":"ok"'; then
	echo "GET /api/health did not return status=ok" >&2
	exit 1
fi

# SPA fallbackの確認
# 実在しない URL を取得し、React Router 用の index.html へ fallback することを確認
spa=$(curl --fail --silent --show-error --cacert "$ca_cert" \
	"$base_url/__nginx_spa_check__")
# Vite の index.html にある root 要素を目印にして SPA の入口と判定することを確認
if ! printf '%s' "$spa" | grep -q '<div id="root"></div>'; then
	echo "SPA fallback did not return the frontend index" >&2
	exit 1
fi

# WASM配信の確認
# 本文を取得せず、render.wasm のレスポンスヘッダのみを取得
wasm_headers=$(curl --fail --silent --show-error --head --cacert "$ca_cert" \
	"$base_url/engine/build/render.wasm")
# HTTP ヘッダ末尾の CR を除き、Content-Type が WASM 用であることを確認
if ! printf '%s' "$wasm_headers" | tr -d '\r' \
	| grep -qi '^content-type: application/wasm$'; then
	echo "render.wasm was not served as application/wasm" >&2
	exit 1
fi

# WSS ハンドシェイクのレスポンスヘッダを一時ファイルへ保存する
ws_headers=$(mktemp)
# 通常終了・エラー・割り込みのどの場合も一時ファイルを削除する
trap 'rm -f "$ws_headers"' EXIT HUP INT TERM

# WSS ハンドシェイクの確認
# WebSocket 通信のための HTTP リクエストを手動で送る
# サーバーから返されたレスポンスヘッダーを $ws_headers へ保存
curl --silent --http1.1 --max-time 2 --cacert "$ca_cert" \
	--dump-header "$ws_headers" --output /dev/null \
	--header 'Connection: Upgrade' \
	--header 'Upgrade: websocket' \
	--header 'Sec-WebSocket-Version: 13' \
	--header 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
	--header 'Origin: https://localhost' \
	"$base_url/ws/lobby" || true

# HTTP 101の確認
# ハンドシェイク後の切断や2秒の timeout ではなく、保存した 101 応答を返すことを確認
if ! tr -d '\r' <"$ws_headers" | grep -q '^HTTP/1.1 101 '; then
	echo "WSS upgrade through nginx did not return HTTP 101" >&2
	exit 1
fi

echo "nginx HTTPS/REST/SPA/WASM/WSS checks passed"
