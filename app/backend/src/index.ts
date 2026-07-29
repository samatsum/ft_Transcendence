// W-01: Fastify の起動骨格。ここに W-02 で zod 検証パイプライン・
// ③§1 エラーエンベロープ/レート制限、W-03 で Prisma、W-08〜W-12 で WS と
// GameRoom（sim.wasm）が載る。現時点は「起動して疎通する」ことだけを担う。
import { pathToFileURL } from 'node:url';

import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { healthSchema, makeError } from '@ft/shared';

import { listMaps, type GameMode } from './game/maps.js';
import { registerGameWs } from './game/ws.js';

// BACKEND_PORT が正（`.env.example` の名前・Vite のプロキシ先と同じ）。
// PORT は docker/PaaS の慣習で注入されることがあるためフォールバックに残す。
// ※ここを `PORT` だけにすると、`.env` で BACKEND_PORT を変えたときに
//   Vite は新ポートへプロキシするのに backend は 3000 で待ち、開発サーバが壊れる
function requirePort(raw: string | undefined, name: string, fallback: number): number {
	if (raw === undefined) return fallback;
	const n = Number(raw);
	if (!Number.isInteger(n) || n < 1 || n > 65535) {
		throw new Error(`${name}="${raw}" は不正なポート番号（1〜65535 の整数が必要）`);
	}
	return n;
}

const PORT = requirePort(
	process.env.BACKEND_PORT ?? process.env.PORT,
	'BACKEND_PORT/PORT',
	3000,
);
// 0.0.0.0 で待つ: Docker のコンテナ外（nginx / ホスト）から到達させるため
const HOST = process.env.HOST ?? '0.0.0.0';

export async function buildServer() {
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

	// W-14: ③ §2-E のマップ一覧。**本文（.cub）は返さない** — マップ本文は
	// welcome.map_text で配るので（② §5-B）、ここは選択 UI 用のメタデータだけ
	app.get('/api/maps', async (request, reply) => {
		const mode = (request.query as { mode?: string }).mode;
		if (mode !== undefined && mode !== 'rsp' && mode !== 'fps') {
			return reply.code(400).send(makeError('validation_failed', `unknown mode: ${mode}`));
		}
		return listMaps(mode as GameMode | undefined);
	});

	// W-11: ゲーム WS（② §5）。ロビー WS（W-08）も同じプラグインに載る
	await app.register(fastifyWebsocket, {
		// ② §2-A の 4KB 上限は handleMessage 側でも見るが、ここでも枠を切っておく
		options: { maxPayload: 64 * 1024 },
	});
	await app.register(async (scoped) => {
		registerGameWs(scoped);
	});

	// 未定義ルートも ③§1-A のエラーエンベロープで返す（形を最初から揃える）
	app.setNotFoundHandler((request, reply) => {
		reply.code(404).send(makeError('not_found', `route not found: ${request.url}`));
	});

	return app;
}

async function main() {
	const app = await buildServer();
	try {
		await app.listen({ port: PORT, host: HOST });
	} catch (err) {
		app.log.error(err);
		process.exit(1);
	}
}

// **直接実行されたときだけ起動する。**
// `buildServer` を import しただけでサーバが立ち上がると、テスト側が自分の
// ポートで listen できずに固まる（W-11 の ws-check.ts で実際に踏んだ）。
// import 時に副作用を持たせないための定型。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	void main();
}
