FROM node:24-bookworm-slim

# package.json の packageManager 指定と同じ npm を使い、ホストの Node 環境に依存しない
RUN npm install --global npm@11.17.0

WORKDIR /workspace

# コンテナ側での node_modules / npm キャッシュディレクトリを作成し、Compose 起動時に
# Docker volume をマウントできるようにする。named volume は初回作成時にこのディレクトリの
# 所有権をそのまま引き継ぐため、あらかじめ任意ユーザーに書き込み権限を与えておく
RUN mkdir -p /workspace/node_modules /tmp/npm-cache \
    && chmod 0777 /workspace/node_modules /tmp/npm-cache
