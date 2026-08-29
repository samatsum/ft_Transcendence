#!/bin/sh
set -eu

cert_dir=${TLS_CERT_DIR:-/etc/nginx/certs}
ca_cert="$cert_dir/ca.crt"
ca_key="$cert_dir/ca.key"
server_cert="$cert_dir/localhost.crt"
server_key="$cert_dir/localhost.key"

# 通常のディレクトリ権限で作成
mkdir -p "$cert_dir"
# 生成する秘密鍵や一時ファイルを所持者のみが読み書きできるようにする
umask 077

# OpenSSL 実行用の関数を定義
run_openssl() {
	error_log=$1	# 第1引数をエラーログの保存先とする
	shift			# shift 第1引数を無視する(引数を左に1つずつずらす)
	# OpenSSLコマンドを実行する
	if ! openssl "$@" 2>"$error_log"; then
		cat "$error_log" >&2
		return 1
	fi
	rm -f "$error_log"
}

# CA 証明書を(再)生成する必要があるかどうかを示す flag
generate_ca=false

# CA 証明書を新規作成
if [ ! -s "$ca_cert" ] || [ ! -s "$ca_key" ] \
	|| ! openssl x509 -checkend 0 -noout -in "$ca_cert" >/dev/null 2>&1; then	# CA 証明書が存在するが無効である
	generate_ca=true
	tmp_dir=$(mktemp -d "$cert_dir/.ca.XXXXXX")
	#  CA 証明書の拡張設定
	## Common Name の設定
	## CA 証明書として使用可能にする
	## 証明書への署名と失効リストへの署名のための鍵として使用可能にする
	run_openssl "$tmp_dir/openssl.log" req -x509 -newkey rsa:3072 -sha256 -noenc -days 3650 \
		-subj '/CN=ft-transcendence local CA' \
		-addext 'basicConstraints=critical,CA:TRUE' \
		-addext 'keyUsage=critical,keyCertSign,cRLSign' \
		-keyout "$tmp_dir/ca.key" \
		-out "$tmp_dir/ca.crt"
	chmod 600 "$tmp_dir/ca.key"
	chmod 644 "$tmp_dir/ca.crt"
	mv -f "$tmp_dir/ca.key" "$ca_key"
	mv -f "$tmp_dir/ca.crt" "$ca_cert"
	rmdir "$tmp_dir"
fi

# localhost 用証明書を(再)生成する必要があるかどうかを示す flag
generate_server=false

if [ "$generate_ca" = true ] || [ ! -s "$server_cert" ] || [ ! -s "$server_key" ]; then
	generate_server=true
# サーバー証明書が期限切れ、または不正な証明書である場合
# 証明書のホスト名が localhost に対応していない場合
# サーバー証明書が現在の CA によって署名されていない場合
elif ! openssl x509 -checkend 0 -noout -in "$server_cert" >/dev/null 2>&1 \
	|| ! openssl x509 -in "$server_cert" -noout -checkhost localhost >/dev/null 2>&1 \
	|| ! openssl verify -CAfile "$ca_cert" "$server_cert" >/dev/null 2>&1; then
	generate_server=true
fi

# CA 証明書を作り直した場合、既存の localhost 証明書も新しい CA で作り直す
if [ "$generate_server" = true ]; then
	tmp_dir=$(mktemp -d "$cert_dir/.server.XXXXXX")
	#  OpenSSL 用の拡張設定ファイルを作成
	## CA 証明書として使用不可にする
	## 電子署名とTLS鍵交換の鍵として使用可能にする
	## サーバー認証用の証明書とする
	## localhost と 127.0.0.1 両方に対応可能にする
	cat >"$tmp_dir/localhost.ext" <<'EOF'
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=DNS:localhost,IP:127.0.0.1
EOF
	# localhost 用の秘密鍵と CSR(Certificate signing request) の生成
	run_openssl "$tmp_dir/openssl.log" req -new -newkey rsa:2048 -sha256 -noenc \
		-subj '/CN=localhost' \
		-keyout "$tmp_dir/localhost.key" \
		-out "$tmp_dir/localhost.csr"
	# CSR から、CA 署名済みの localhost 証明書を生成
	run_openssl "$tmp_dir/openssl.log" x509 -req -sha256 -days 365 \
		-in "$tmp_dir/localhost.csr" \
		-CA "$ca_cert" \
		-CAkey "$ca_key" \
		-extfile "$tmp_dir/localhost.ext" \
		-out "$tmp_dir/localhost.crt"
	chmod 600 "$tmp_dir/localhost.key"
	chmod 644 "$tmp_dir/localhost.crt"
	mv -f "$tmp_dir/localhost.key" "$server_key"
	mv -f "$tmp_dir/localhost.crt" "$server_cert"
	rm -f "$tmp_dir/localhost.csr" "$tmp_dir/localhost.ext"
	rmdir "$tmp_dir"
fi

exec "$@"
