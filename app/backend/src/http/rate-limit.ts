// B-02: ③§1-C のレート制限。
//
// GET とそれ以外で閾値が違う（120/分 vs 30/分）ので `max` を関数にして
// リクエストごとに出し分ける。カウンタ（`keyGenerator` の返り値）も
// `ip:get` / `ip:mut` でクラス分けし、GET の連打が mutating 側の枠を
// 消費しない・その逆も起きないようにする
// （@fastify/rate-limit は `global: true` かつルート個別設定が無いとき、
// 全ルートで単一のカウンタ store を共有する。`max` だけをメソッドで
// 出し分けても、カウンタ自体を分けなければ GET と POST が同じ枠を取り合う
// ため、キー側でも分離が必要——`node_modules/@fastify/rate-limit/index.js`
// の `applyRateLimit` / `LocalStore` を読んで確認した）。
//
// `POST /api/auth/login|signup`（5/分/IP）・`PUT /api/users/me/avatar`（3/分）は
// B-04/B-05 がルートを追加するときに、そのルートで
// `config: { rateLimit: { max, timeWindow: '1 minute' } }` を渡して上書きする
// （上書きすると @fastify/rate-limit が専用のカウンタ store を自動的に切る）。
import fastifyRateLimit from '@fastify/rate-limit';
import type { FastifyError, FastifyInstance } from 'fastify';

const GET_MAX = 120; // ③§1-C: GET endpoints
const MUTATING_MAX = 30; // ③§1-C: Other mutating endpoints
const WINDOW = '1 minute';

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

// OPTIONS は安全メソッド（状態を変えない）なので GET 側の枠として扱う。
// ここを「GET/HEAD 以外は mutating」にすると CORS プリフライトの OPTIONS が
// 書き込み系の30/分を消費し、実際の POST/PUT より先に枠を使い切ってしまう
function isMutating(method: string): boolean {
	return MUTATING_METHODS.has(method);
}

export async function registerRateLimit(app: FastifyInstance): Promise<void> {
	await app.register(fastifyRateLimit, {
		global: true,
		timeWindow: WINDOW,
		max: (request) => (isMutating(request.method) ? MUTATING_MAX : GET_MAX),
		// ③§1-C は「per IP + per session」。セッション（B-04）が無い間は IP のみで区切る
		keyGenerator: (request) => `${request.ip}:${isMutating(request.method) ? 'mut' : 'get'}`,
		// エンベロープの組み立ては http/errors.ts に一本化する。
		// ここでは `FT_RATE_LIMITED` を付けた Error を投げるだけにする
		// （@fastify/rate-limit はこの戻り値を throw するので、通常の
		// setErrorHandler 経路に乗る）
		errorResponseBuilder: (_request, context) => {
			const err = new Error(`too many requests, retry after ${context.after}`) as FastifyError;
			err.code = 'FT_RATE_LIMITED';
			err.statusCode = context.statusCode;
			return err;
		},
	});
}
