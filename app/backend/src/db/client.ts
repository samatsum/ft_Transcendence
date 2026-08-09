// B-03: PrismaClient の生成口。
//
// **ここは「DB へ繋げる」ところまでで、まだ誰も呼んでいません。**
// 実際に読み書きするのは B-04（認証で User / Session を触る）から。B-03 のスコープを
// 「スキーマ + マイグレーション + 疎通確認」に切ったのは、`index.ts` の起動時に接続を
// 張ると CI の `web-app` ジョブ（backend を起動して `/api/health` を叩く）にも
// DB 生成とマイグレーションが必要になり、B-03 の変更範囲が CI 全体へ広がるため。
//
// Prisma 7 では PrismaClient に**ドライバアダプタが必須**（従来の同梱クエリエンジンは
// 廃止）。SQLite は `@prisma/adapter-better-sqlite3` を使う。
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

import { PrismaClient } from '../generated/prisma/client.js';

/** `prisma.config.ts` の既定値と揃えること（片方だけ変えると参照先がずれる）。 */
const DEV_DEFAULT_URL = 'file:./data/dev.db';

/**
 * PrismaClient を1つ作る。
 *
 * 呼び出し側が寿命を持つ（B-04 以降、Fastify のライフサイクルに合わせて
 * `$disconnect()` する）。ここでモジュールスコープのシングルトンを作らないのは、
 * import しただけで接続が張られると、DB を使わない `check:lobby` や
 * `check:http` にまで SQLite ファイルが要るようになるため。
 */
export function createPrismaClient(url = process.env.DATABASE_URL ?? DEV_DEFAULT_URL): PrismaClient {
	return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url }) });
}
