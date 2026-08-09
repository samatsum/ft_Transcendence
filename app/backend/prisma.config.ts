// B-03: Prisma CLI の設定。
//
// **Prisma 7 から `datasource.url` をスキーマに書けなくなった**（P1012）。
// マイグレーションと introspection が使う接続先はここで渡す。実行時（PrismaClient）
// 側はドライバアダプタ経由で別に受け取るので、接続先の指定が2箇所に分かれている。
// どちらも同じ `DATABASE_URL` を読むため、値の正本は .env（例は .env.example）。
//
// `DATABASE_URL` の相対パスは **このファイルの位置（app/backend/）が基準**。
// 既定値は `file:./data/dev.db` = `app/backend/data/dev.db`。
import { defineConfig } from 'prisma/config';

/**
 * Prisma の `env()` ヘルパは未設定だと例外を投げるため、ここでは使わない。
 *
 * `prisma generate` は CI の `npm ci` 直後（DATABASE_URL が無い状態）でも走る必要が
 * ある——型が生成されていないと `npm run typecheck` が落ちるため。`env()` のままだと
 * そこで `PrismaConfigEnvError` になり、CI が赤くなる。
 *
 * 接続先はローカルのファイル1個なので、開発用の既定値を持たせて構わない。
 * 本番・コンテナ側（I-15）は `DATABASE_URL` を明示的に渡すこと。
 */
const DEV_DEFAULT_URL = 'file:./data/dev.db';

export default defineConfig({
	schema: 'prisma/schema.prisma',
	migrations: {
		path: 'prisma/migrations',
	},
	datasource: {
		url: process.env.DATABASE_URL ?? DEV_DEFAULT_URL,
	},
});
