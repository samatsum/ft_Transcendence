// W-01: Fastify の起動骨格。ここに W-02 で zod 検証パイプライン・
// ③§1 エラーエンベロープ/レート制限、W-03 で Prisma、W-08〜W-12 で WS と
// GameRoom（sim.wasm）が載る。現時点は「起動して疎通する」ことだけを担う。
import Fastify from 'fastify';
import { healthSchema, makeError } from '@ft/shared';

const PORT = Number(process.env.PORT ?? 3000);
// 0.0.0.0 で待つ: Docker のコンテナ外（nginx / ホスト）から到達させるため
const HOST = process.env.HOST ?? '0.0.0.0';

export function buildServer() {
	// pino のログ設定は W-02 で本格化する（開発中は既定の JSON ログ）
	const app = Fastify({ logger: true });

	// 疎通確認。返す形は shared の zod スキーマで自己検証し、
	// FE/BE が同じ契約を共有していることを起動時に保証する
	app.get('/api/health', async () => {
		return healthSchema.parse({
			status: 'ok',
			service: 'ft-transcendence-backend',
			time: new Date().toISOString(),
		});
	});

	// 未定義ルートも ③§1-A のエラーエンベロープで返す（形を最初から揃える）
	app.setNotFoundHandler((request, reply) => {
		reply.code(404).send(makeError('not_found', `route not found: ${request.url}`));
	});

	return app;
}

async function main() {
	const app = buildServer();
	try {
		await app.listen({ port: PORT, host: HOST });
	} catch (err) {
		app.log.error(err);
		process.exit(1);
	}
}

main();
