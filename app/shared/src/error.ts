import { z } from 'zod';

// ③ §1-A のエラーエンベロープ。失敗レスポンスは全エンドポイント共通でこの形。
// code は ② §2-C と同じ機械可読 snake_case 空間を共有する（REST/WS で語彙を分けない）。
export const errorCodeSchema = z.enum([
	'validation_failed',
	'unauthenticated',
	'forbidden',
	'not_found',
	'conflict',
	'email_taken',
	'name_taken',
	'already_friends',
	'payload_too_large',
	'unsupported_media_type',
	'rate_limited',
	'internal_error',
]);

export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const errorEnvelopeSchema = z.object({
	error: z.object({
		code: errorCodeSchema,
		msg: z.string(),
		// フィールド別の理由（zod 検証エラー時に埋める）
		details: z.record(z.string(), z.string()).optional(),
	}),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;

// ③ §1-A の HTTP ステータス対応。W-02 のエラーハンドラがこの表を使う
export const errorStatusByCode: Record<ErrorCode, number> = {
	validation_failed: 400,
	unauthenticated: 401,
	forbidden: 403,
	not_found: 404,
	conflict: 409,
	email_taken: 409,
	name_taken: 409,
	already_friends: 409,
	payload_too_large: 413,
	unsupported_media_type: 415,
	rate_limited: 429,
	internal_error: 500,
};

// エラーエンベロープを組み立てる（サーバ・クライアント双方から使う）
export function makeError(
	code: ErrorCode,
	msg: string,
	details?: Record<string, string>,
): ErrorEnvelope {
	return { error: { code, msg, ...(details ? { details } : {}) } };
}
