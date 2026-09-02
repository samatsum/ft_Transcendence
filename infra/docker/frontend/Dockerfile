FROM node:24-bookworm-slim

# package.json の packageManager 指定と同じ npm を使い、ホストの Node 環境に依存しない
RUN npm install --global npm@11.17.0

WORKDIR /workspace

# コンテナ側での node_modules ディレクトリを作成し、Compose 起動時に Docker volume をマウントできるようにする
# 任意のユーザーに実行権限を与える
RUN mkdir -p /workspace/node_modules && chmod 0777 /workspace/node_modules
