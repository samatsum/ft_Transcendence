// I-01 の起動骨格に B-02 で zod 検証パイプライン・③§1 エラーエンベロープ/
// レート制限を配線した。B-03 で Prisma、B-08〜B-12 で WS と GameRoom
// （sim.wasm）が載る。
import { pathToFileURL } from 'node:url';

import Fastify from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyWebsocket from '@fastify/websocket';
import { healthSchema, listMapsQuerySchema, makeError } from '@ft/shared';

import { registerAuthRoutes } from './auth/routes.js';
import { createPrismaClient } from './db/client.js';
import { listMaps } from './game/maps.js';
import { closeAllRooms } from './game/rooms.js';
import { registerGameWs } from './game/ws.js';
import { registerErrorHandler } from './http/errors.js';
import { loggerOptions } from './http/logger.js';
import { registerRateLimit } from './http/rate-limit.js';
import { registerLobbyWs } from './lobby/ws.js';
import { ConnectionManager } from './ws/connection.js';

// BACKEND_PORT が正（`.env.example` の名前・Vite のプロキシ先と同じ）。
// PORT は docker/PaaS の慣習で注入されることがあるためフォールバックに残す。
// ※ここを `PORT` だけにすると、`.env` で BACKEND_PORT を変えたときに
//   Vite は新ポートへプロキシするのに backend は 3000 で待ち、開発サーバが壊れる
/** 環境変数のportを1..65535の整数として解決する */
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

export interface BuildServerOptions {
	connectionManager?: ConnectionManager;
}

/** Fastify serverと、そのserver専用のWebSocket接続管理を構築する */
export async function buildServer(options: BuildServerOptions = {}) {
	const app = Fastify({ logger: loggerOptions() });
	const connectionManager = options.connectionManager ?? new ConnectionManager();

	// ③§1-A: 全ルート共通のエラーエンベロープ。ZodError の自動変換もここに載る
	registerErrorHandler(app);
	// ③§1-C: レート制限（GET 120/分・その他の書き込み 30/分。既定値の上書きは
	// ルート追加時に `config.rateLimit` で行う）
	await registerRateLimit(app);

	// 疎通確認。返す形は shared の zod スキーマで自己検証し、
	// FE/BE が同じ契約を共有していることを起動時に保証する
	app.get('/api/health', async () => {
		return healthSchema.parse({
			status: 'ok',
			service: 'ft-transcendence-backend',
			time: new Date().toISOString(),
		});
	});

	// B-14: ③ §2-E のマップ一覧。**本文（.cub）は返さない** — マップ本文は
	// welcome.map_text で配るので（② §5-B）、ここは選択 UI 用のメタデータだけ。
	// クエリの検証は B-02 の zod パイプライン: `.parse()` が投げた ZodError は
	// registerErrorHandler が 400 validation_failed に変換する
	app.get('/api/maps', async (request) => {
		const { mode } = listMapsQuerySchema.parse(request.query);
		return listMaps(mode);
	});

	// B-04: ③§2-A の `POST /api/auth/login`。DB は buildServer 呼び出しごとに
	// 生成するだけで、実際に開かれるのは最初のクエリが飛んだ時（B-03 の前提を維持——
	// `/api/health` だけを叩く CI ジョブや DB を使わない check:* は今まで通り DB 不要）
	await app.register(fastifyCookie);
	const prisma = createPrismaClient();
	app.addHook('onClose', async () => {
		await prisma.$disconnect();
	});
	registerAuthRoutes(app, { prisma });

	// B-11: ゲーム WS（② §5）。ロビー WS（B-08）も同じプラグインに載る
	await app.register(fastifyWebsocket, {
		// ② §2-A の 4KB 上限は handleMessage 側でも見るが、ここでも枠を切っておく
		options: { maxPayload: 64 * 1024 },
	});
	await app.register(async (scoped) => {
		registerGameWs(scoped, connectionManager);
		registerLobbyWs(scoped, { connectionManager });
	});
	app.addHook('onClose', async () => {
		closeAllRooms();
		connectionManager.clear();
	});

	// 未定義ルートも ③§1-A のエラーエンベロープで返す（形を最初から揃える）
	app.setNotFoundHandler((request, reply) => {
		reply.code(404).send(makeError('not_found', `route not found: ${request.url}`));
	});

	return app;
}

/** 直接起動時にserverをlistenし、起動失敗を構造化ログへ出す */
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
// ポートで listen できずに固まる（B-11 の ws-check.ts で実際に踏んだ）。
// import 時に副作用を持たせないための定型。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	void main();
}
