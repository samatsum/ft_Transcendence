#!/bin/sh
set -eu

cert_dir=${TLS_CERT_DIR:-/etc/nginx/certs}
ca_cert="$cert_dir/ca.crt"
ca_key="$cert_dir/ca.key"

# nginx.conf.template に埋めるホスト名。ローカルの compose は既定の localhost、
# VPS は docker-compose.vps.yml が nip.io などのホスト名を渡す
SERVER_NAME=${SERVER_NAME:-localhost}

# 証明書の場所。既定はこのスクリプトが自己署名で作るローカル CA のもの。
# **既定以外を指している場合（Let's Encrypt 等）は生成も上書きもしない。**
# 生成側の判定は「証明書が localhost 用か」を見るので、外部の証明書を
# 既定パスに置くと作り直されてしまう
server_cert=${TLS_CERT:-$cert_dir/localhost.crt}
server_key=${TLS_KEY:-$cert_dir/localhost.key}

# 自己署名を管理するのは既定パスを使っているときだけ
if [ "$server_cert" = "$cert_dir/localhost.crt" ] && [ "$server_key" = "$cert_dir/localhost.key" ]; then
	manage_self_signed=true
else
	manage_self_signed=false
fi

# テンプレートからホスト名と証明書パスを埋めた nginx.conf を書き出す。
# **置換する変数名を列挙する。** 省略すると `$uri` や `$http_upgrade` といった
# nginx 自身の変数まで空文字に潰れる
render_config() {
	export SERVER_NAME
	TLS_CERT=$server_cert
	TLS_KEY=$server_key
	export TLS_CERT TLS_KEY
	envsubst '${SERVER_NAME} ${TLS_CERT} ${TLS_KEY}' \
		</etc/nginx/nginx.conf.template >/etc/nginx/nginx.conf
}

# 外部の証明書（Let's Encrypt 等）を渡された場合は、生成も検証もせず
# 存在だけ確かめて起動する。証明書の更新はこのコンテナの外の責任
if [ "$manage_self_signed" = false ]; then
	for f in "$server_cert" "$server_key"; do
		if [ ! -s "$f" ]; then
			echo "TLS_CERT / TLS_KEY が指すファイルがない: $f" >&2
			echo "certbot で取得済みか、マウント先が合っているかを確認すること。" >&2
			exit 1
		fi
	done
	render_config
	exec "$@"
fi

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

# 証明書と秘密鍵が対応する鍵ペアかどうかを、公開鍵の比較で検証する
keys_match() {
	cert=$1
	key=$2
	cert_pubkey=$(openssl x509 -in "$cert" -noout -pubkey 2>/dev/null) || return 1
	key_pubkey=$(openssl pkey -in "$key" -pubout 2>/dev/null) || return 1
	[ -n "$cert_pubkey" ] && [ "$cert_pubkey" = "$key_pubkey" ]
}

# CA 証明書を(再)生成する必要があるかどうかを示す flag
generate_ca=false

# CA 証明書を新規作成
if [ ! -s "$ca_cert" ] || [ ! -s "$ca_key" ] \
	|| ! openssl x509 -checkend 0 -noout -in "$ca_cert" >/dev/null 2>&1 \
	|| ! keys_match "$ca_cert" "$ca_key"; then	# CA 証明書が存在するが無効、または証明書と秘密鍵が対応していない
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
	|| ! openssl x509 -in "$server_cert" -noout -checkhost "$SERVER_NAME" >/dev/null 2>&1 \
	|| ! openssl verify -CAfile "$ca_cert" "$server_cert" >/dev/null 2>&1 \
	|| ! keys_match "$server_cert" "$server_key"; then
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
	## SERVER_NAME が localhost 以外なら（自己署名のまま VPS を試す場合）それも入れる
	san='DNS:localhost,IP:127.0.0.1'
	if [ "$SERVER_NAME" != localhost ]; then
		san="$san,DNS:$SERVER_NAME"
	fi
	cat >"$tmp_dir/localhost.ext" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
subjectAltName=$san
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

render_config
exec "$@"
