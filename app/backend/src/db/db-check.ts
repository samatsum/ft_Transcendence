// B-03 の受入検査（③§3: schema v1 の5テーブルが、設計どおりの制約で作られている）。
// 実行: npm run check:db --workspace @ft/backend
//
// 一時ファイルの DB に対して `prisma migrate deploy` を流し、そこへ実際に読み書きする。
// 開発用の `data/dev.db` は触らない（検査が開発中のデータを壊さないため）。
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createPrismaClient } from './client.js';

const backendRoot = fileURLToPath(new URL('../..', import.meta.url));

/** ③§3 が定義する5テーブル。`_prisma_migrations` は Prisma の管理表なので数えない。 */
const EXPECTED_TABLES = ['Friendship', 'Match', 'MatchPlayer', 'Session', 'User'];

async function main(): Promise<void> {
	const dir = mkdtempSync(join(tmpdir(), 'ft-db-check-'));
	const url = `file:${join(dir, 'check.db')}`;

	console.log('B-03 検査1: migrate deploy が空の DB に通る');
	execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
		cwd: backendRoot,
		env: { ...process.env, DATABASE_URL: url },
		stdio: 'pipe',
	});
	console.log('  OK');

	const prisma = createPrismaClient(url);
	try {
		console.log('B-03 検査2: ③§3 の5テーブルが存在する');
		const rows = await prisma.$queryRaw<{ name: string }[]>`
			SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name
		`;
		// `_prisma_migrations`（Prisma の管理表）と `sqlite_*`（SQLite の内部表）を除く。
		// SQL の LIKE でやると `_` がワイルドカードなので ESCAPE が要り、テンプレート
		// リテラル中のバックスラッシュで壊れやすい。ここで弾く方が確実。
		const tables = rows
			.map((r) => r.name)
			.filter((name) => !name.startsWith('_') && !name.startsWith('sqlite_'));
		assert.deepEqual(tables, EXPECTED_TABLES);
		console.log(`  OK (${EXPECTED_TABLES.join(' / ')})`);

		console.log('B-03 検査3: User を作成でき、AI席（userId=null）を含む試合も記録できる');
		const user = await prisma.user.create({
			data: {
				email: 'checker@example.test',
				passwordHash: 'argon2id$placeholder',
				displayName: 'Checker',
				displayNameLower: 'checker',
			},
		});
		assert.equal(user.avatarPath, null, 'avatarPath は任意（B-06 不採用のため常に null）');

		const match = await prisma.match.create({
			data: {
				mode: 'rsp',
				mapId: 'rsp',
				settingsJson: JSON.stringify({ target_score: 10 }),
				players: {
					create: [
						{ userId: user.id, isAi: false, team: 0, slot: 0, pointsScored: 10, result: 'win' },
						{ userId: null, isAi: true, team: 1, slot: 1, pointsScored: 3, result: 'lose' },
					],
				},
			},
			include: { players: true },
		});
		assert.equal(match.players.length, 2);
		assert.equal(match.players.filter((p) => p.userId === null).length, 1, 'AI席も行として残る（③§3）');
		console.log('  OK');

		console.log('B-03 検査4: email / displayNameLower の一意制約が効く');
		await assert.rejects(
			prisma.user.create({
				data: {
					email: 'checker@example.test',
					passwordHash: 'x',
					displayName: 'Other',
					displayNameLower: 'other',
				},
			}),
			'同じ email は弾かれる',
		);
		await assert.rejects(
			prisma.user.create({
				data: {
					email: 'other@example.test',
					passwordHash: 'x',
					// ③§1-B「大文字小文字を無視して一意」。displayName 自体は別値でも、
					// 正規化列が衝突するので弾かれる。
					displayName: 'CHECKER',
					displayNameLower: 'checker',
				},
			}),
			'大文字違いの表示名は displayNameLower で弾かれる',
		);
		console.log('  OK');

		console.log('B-03 検査5: MatchPlayer の (matchId, slot) が一意');
		await assert.rejects(
			prisma.matchPlayer.create({
				data: { matchId: match.id, userId: null, isAi: true, team: 1, slot: 1, pointsScored: 0, result: 'lose' },
			}),
			'同じ試合で slot が重複する行は作れない',
		);
		console.log('  OK');

		console.log('B-03 検査6: Session は tokenHash 一意、User 削除で連鎖削除される');
		await prisma.session.create({
			data: { userId: user.id, tokenHash: 'sha256-placeholder', expiresAt: new Date(Date.now() + 3600_000) },
		});
		await prisma.user.delete({ where: { id: user.id } });
		assert.equal(await prisma.session.count(), 0, 'User を消すと Session も消える');
		assert.equal(
			(await prisma.matchPlayer.findFirst({ where: { slot: 0 } }))?.userId,
			null,
			'MatchPlayer は残り、userId だけ null になる（統計行を消さない）',
		);
		console.log('  OK');

		console.log('B-03: ③§3 の schema v1 が設計どおり生成・適用できています');
	} finally {
		await prisma.$disconnect();
		rmSync(dir, { recursive: true, force: true });
	}
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
