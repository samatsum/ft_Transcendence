// B-02 の受入検査（③§1: 不正入力が ③§1-A の形で 400/429 を返す）。
// 実行: npm run check:http --workspace @ft/backend
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';

import type { FastifyInstance } from 'fastify';
import { errorEnvelopeSchema } from '@ft/shared';

import { buildServer } from '../index.js';

/**
 * `buildServer()` を起動し、`setup` で検査用ルートを追加してから listen する。
 * ルート追加は listen 前に済ませる（Fastify はルート確定後に listen する前提のため）。
 */
async function withServer<T>(
	setup: (app: FastifyInstance) => void,
	fn: (baseUrl: string) => Promise<T>,
): Promise<T> {
	const app = await buildServer();
	setup(app);
	await app.listen({ port: 0, host: '127.0.0.1' });
	const { port } = app.server.address() as AddressInfo;
	try {
		return await fn(`http://127.0.0.1:${port}`);
	} finally {
		await app.close();
	}
}

/** ③§1-A/§1-B: zod 検証パイプラインが不正クエリを 400 validation_failed へ変換する */
async function checkValidationFailed(): Promise<void> {
	await withServer(
		() => {},
		async (base) => {
			const bad = await fetch(`${base}/api/maps?mode=bogus`);
			assert.equal(bad.status, 400);
			const body = errorEnvelopeSchema.parse(await bad.json());
			assert.equal(body.error.code, 'validation_failed');
			assert.ok(body.error.details && 'mode' in body.error.details, 'details に mode の理由が入る');

			const ok = await fetch(`${base}/api/maps?mode=rsp`);
			assert.equal(ok.status, 200);
		},
	);
}

/** ③§1-A: 未定義ルートも同じ形で 404 を返す（I-01 由来の回帰確認） */
async function checkNotFound(): Promise<void> {
	await withServer(
		() => {},
		async (base) => {
			const res = await fetch(`${base}/api/nope`);
			assert.equal(res.status, 404);
			const body = errorEnvelopeSchema.parse(await res.json());
			assert.equal(body.error.code, 'not_found');
		},
	);
}

/** ③§1-C: GET は 120/分 で頭打ちになり、③§1-A の形で 429 を返す */
async function checkGetRateLimit(): Promise<void> {
	await withServer(
		() => {},
		async (base) => {
			let sawLimited = false;
			let okCount = 0;
			for (let i = 0; i < 130; i++) {
				const res = await fetch(`${base}/api/health`);
				if (res.status === 429) {
					sawLimited = true;
					const body = errorEnvelopeSchema.parse(await res.json());
					assert.equal(body.error.code, 'rate_limited');
					break;
				}
				assert.equal(res.status, 200);
				okCount++;
			}
			assert.ok(sawLimited, '130回叩けば120/分の上限に達するはず');
			assert.equal(okCount, 120, '120回目までは通る');
		},
	);
}

/**
 * ③§1-C: 書き込み系は 30/分 で、GET のカウンタとは独立している。
 * `/api/__check_mut` はこの検査専用の POST/OPTIONS ルート（本番の index.ts には無い）。
 * B-04/B-05 が実 POST ルートを追加するまでの代役として、
 * registerRateLimit のメソッド別カウンタ分離を検証する
 */
async function checkMutatingRateLimit(): Promise<void> {
	await withServer(
		(app) => {
			app.post('/api/__check_mut', async () => ({ ok: true }));
			app.options('/api/__check_mut', async () => ({ ok: true }));
		},
		async (base) => {
			// GET を先に何度か叩いても mutating 側のカウンタは減らない（キー分離の確認）
			for (let i = 0; i < 10; i++) {
				const res = await fetch(`${base}/api/health`);
				assert.equal(res.status, 200);
			}

			// OPTIONS（安全メソッド）を先に何度叩いても mutating 側の枠は減らない。
			// CORS プリフライトが書き込み系の30/分を消費しないことの確認
			for (let i = 0; i < 10; i++) {
				const res = await fetch(`${base}/api/__check_mut`, { method: 'OPTIONS' });
				assert.equal(res.status, 200);
			}

			let sawLimited = false;
			let okCount = 0;
			for (let i = 0; i < 40; i++) {
				const res = await fetch(`${base}/api/__check_mut`, { method: 'POST' });
				if (res.status === 429) {
					sawLimited = true;
					const body = errorEnvelopeSchema.parse(await res.json());
					assert.equal(body.error.code, 'rate_limited');
					break;
				}
				assert.equal(res.status, 200);
				okCount++;
			}
			assert.ok(sawLimited, '40回叩けば30/分の上限に達するはず');
			assert.equal(okCount, 30, '30回目までは通る');
		},
	);
}

async function main(): Promise<void> {
	console.log('B-02 検査1: 不正クエリ → 400 validation_failed（③§1-A/§1-B）');
	await checkValidationFailed();
	console.log('  OK');

	console.log('B-02 検査2: 未定義ルート → 404（回帰）');
	await checkNotFound();
	console.log('  OK');

	console.log('B-02 検査3: GET レート制限 120/分 → 429 rate_limited（③§1-C）');
	await checkGetRateLimit();
	console.log('  OK');

	console.log('B-02 検査4: 書き込み系レート制限 30/分・GETと独立（③§1-C）');
	await checkMutatingRateLimit();
	console.log('  OK');

	console.log('B-02: ③§1 の受入条件（不正入力が③§1-Aの形で400/429を返す）を満たしています');
}

main().catch((error: unknown) => {
	console.error(error);
	process.exit(1);
});
