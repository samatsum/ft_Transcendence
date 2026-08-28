FROM node:24-bookworm-slim AS builder

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global npm@11.17.0

WORKDIR /workspace

# lockfile に基づいて依存を固定するため、workspace の manifest を先にコピーする
COPY package.json package-lock.json ./
COPY app/backend/package.json ./app/backend/package.json
COPY app/shared/package.json ./app/shared/package.json
COPY app/frontend/package.json ./app/frontend/package.json
RUN npm ci --include=dev --workspace @ft/backend --workspace @ft/shared --include-workspace-root

# アプリの入力のみをコピーする
# ホスト側の node_modules・DB・.env は持ち込まない
COPY app/tsconfig.base.json ./app/tsconfig.base.json
COPY app/backend/tsconfig.json app/backend/prisma.config.ts ./app/backend/
COPY app/backend/prisma ./app/backend/prisma
COPY app/backend/src ./app/backend/src
COPY app/shared/tsconfig.json ./app/shared/tsconfig.json
COPY app/shared/src ./app/shared/src
COPY maps ./maps
COPY web/package.json ./web/package.json

# shared を型検査した後、backend 側で Prisma Client の生成と型検査を行う
RUN npm run typecheck --workspace @ft/shared \
    && npm run typecheck --workspace @ft/backend

# Prisma の optional peer として再導入される TypeScript も本番依存から除外する
RUN npm ci --omit=dev --omit=peer --workspace @ft/backend --workspace @ft/shared \
    && rm -rf /workspace/node_modules/typescript

FROM node:24-bookworm-slim AS runtime

RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && npm install --global npm@11.17.0

WORKDIR /workspace

# builder で native addon を含む本番依存だけに絞った結果を引き継ぐ
COPY --from=builder /workspace/node_modules ./node_modules

# tsx 実行・workspace 解決・起動時 migration に必要なファイルだけをコピーする
COPY package.json package-lock.json ./
COPY app/backend/package.json ./app/backend/package.json
COPY app/shared/package.json ./app/shared/package.json
COPY app/tsconfig.base.json ./app/tsconfig.base.json
COPY app/backend/tsconfig.json app/backend/prisma.config.ts ./app/backend/
COPY app/backend/prisma ./app/backend/prisma
COPY --from=builder /workspace/app/backend/src ./app/backend/src
COPY app/shared/tsconfig.json ./app/shared/tsconfig.json
COPY app/shared/src ./app/shared/src
COPY maps ./maps
COPY web/package.json ./web/package.json

RUN mkdir -p /data \
    && chown node:node /data

COPY --chmod=755 infra/docker/backend/entrypoint.sh /usr/local/bin/backend-entrypoint.sh

ENV NODE_ENV=production
WORKDIR /workspace/app/backend
USER node

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/backend-entrypoint.sh"]
CMD ["node", "--import", "tsx", "src/index.ts"]
