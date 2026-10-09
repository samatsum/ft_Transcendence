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

/** `ensureSqlitePragmas` の実行済みフラグ。接続は1本なのでプロセスに1つで足りる */
let sqlitePragmas: Promise<void> | null = null;

async function applySqlitePragmas(prisma: PrismaClient): Promise<void> {
	// 読み書きが互いを待たなくなる。DB ファイル側に記録されるので一度で永続
	await prisma.$queryRawUnsafe('PRAGMA journal_mode=WAL');
	// WAL と組むときの定番。既定の FULL はコミットごとに fsync する。**接続ごとの
	// 設定なので毎プロセスで入れ直す必要がある**（journal_mode と違って永続しない）
	await prisma.$queryRawUnsafe('PRAGMA synchronous=NORMAL');
	// 競合時に即 SQLITE_BUSY で失敗せず待つ
	await prisma.$queryRawUnsafe('PRAGMA busy_timeout=5000');
}

/**
 * SQLite の接続設定を一度だけ適用する。
 *
 * **better-sqlite3 は同期実行なので、コミットのたびにイベントループが止まる。**
 * 既定の DELETE ジャーナル + `synchronous=FULL` ではコミットごとに fsync が入り、
 * 30Hz の試合ループもスナップショット配信もその間進まない。
 *
 * **`createPrismaClient` や起動時ではなく、初回クエリの直前に呼ぶこと。**
 * `index.ts` は「DB が実際に開かれるのは最初のクエリが飛んだ時」という前提を
 * 保っており（`/api/health` だけを叩く CI ジョブや DB を使わない `check:*` が
 * SQLite ファイル無しで動くのはそのため）、起動時に流すとこれを壊す。
 *
 * プラグマは速度のための設定で、失敗しても認証の正しさには影響しない。ここで
 * 例外を投げると呼び出し側（`authenticateRequest`）に伝わってしまうので、
 * 握って次回に再試行させる。
 */
export function ensureSqlitePragmas(prisma: PrismaClient): Promise<void> {
	sqlitePragmas ??= applySqlitePragmas(prisma).catch(() => {
		sqlitePragmas = null;
	});
	return sqlitePragmas;
}
