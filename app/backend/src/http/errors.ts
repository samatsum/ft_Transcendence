// B-02: ③§1-A のエラーエンベロープを全ルートに一律適用するグローバルハンドラ。
//
// 個々のルートは zod スキーマの `.parse()` を呼ぶだけでよい（例: `/api/maps`）。
// 失敗時の変換（ZodError → 400 validation_failed 他）はここに一元化し、
// ルートが増えるたびに同じ if 文を書かずに済むようにする。
//
// `@fastify/rate-limit` の 429 も実はここを経由する
// （`node_modules/@fastify/rate-limit/index.js` を読むと `errorResponseBuilder`
// の戻り値を `throw` している＝ Fastify の通常のエラー経路に乗る。
// 「プラグインが reply を直接送るので経由しない」という誤った想定で書いたら
// 500 に落ちる回帰を check:http で実際に踏んだ）。`http/rate-limit.ts` は
// `code: 'FT_RATE_LIMITED'` を付けた Error を投げるだけにして、
// エンベロープの組み立てはこのファイルに一本化する。
import { ZodError } from 'zod';
import type { FastifyError, FastifyInstance } from 'fastify';
import { makeError, type ErrorCode } from '@ft/shared';

/** ZodError の issues を `{ field: reason }` に畳み込む（③§1-A の details 形） */
function zodDetails(err: ZodError): Record<string, string> {
	const details: Record<string, string> = {};
	for (const issue of err.issues) {
		const field = issue.path.length > 0 ? issue.path.join('.') : '(root)';
		// 同じフィールドに複数エラーが付く場合は先勝ち（details は要約用の1行）
		if (!(field in details)) details[field] = issue.message;
	}
	return details;
}

/**
 * Fastify 組み込みエラー・プラグイン由来のエラーを ③§1-A の code へ対応付ける。
 * `FT_RATE_LIMITED` は `http/rate-limit.ts` が付ける独自コード
 */
function mapFastifyErrorCode(code: string | undefined): ErrorCode | undefined {
	switch (code) {
		case 'FST_ERR_CTP_BODY_TOO_LARGE':
			return 'payload_too_large';
		case 'FST_ERR_CTP_INVALID_MEDIA_TYPE':
			return 'unsupported_media_type';
		case 'FST_ERR_CTP_INVALID_CONTENT_LENGTH':
		case 'FST_ERR_CTP_EMPTY_JSON_BODY':
		case 'FST_ERR_CTP_INVALID_JSON_BODY':
			return 'validation_failed';
		case 'FT_RATE_LIMITED':
			return 'rate_limited';
		default:
			return undefined;
	}
}

const STATUS_BY_MAPPED_CODE: Partial<Record<ErrorCode, number>> = {
	payload_too_large: 413,
	unsupported_media_type: 415,
	validation_failed: 400,
	rate_limited: 429,
};

/** グローバルエラーハンドラを登録する。buildServer から一度だけ呼ぶ */
export function registerErrorHandler(app: FastifyInstance): void {
	app.setErrorHandler((err: FastifyError, request, reply) => {
		if (err instanceof ZodError) {
			reply.code(400).send(makeError('validation_failed', 'invalid request', zodDetails(err)));
			return;
		}

		const mapped = mapFastifyErrorCode(err.code);
		if (mapped) {
			reply.code(STATUS_BY_MAPPED_CODE[mapped] ?? 400).send(makeError(mapped, err.message));
			return;
		}

		// Fastify 自身が付けた 4xx（不正なルーティング/パース由来）は
		// ステータスを踏襲しつつ語彙だけ ③§1-A に寄せる。判定できないものは隠蔽する
		if (err.statusCode !== undefined && err.statusCode >= 400 && err.statusCode < 500) {
			reply.code(err.statusCode).send(makeError('validation_failed', err.message));
			return;
		}

		request.log.error(err, 'unhandled error');
		reply.code(500).send(makeError('internal_error', 'internal server error'));
	});
}
