import { z } from 'zod';

import { errorCodeSchema } from '../error.js';

// ② §2-C エラーメッセージ（インライン）。
//
// **REST と語彙を分けない**（② §2-C・`error.ts` のコメント）。ただし
// `errorStatusByCode` が `Record<ErrorCode, number>` で全網羅を要求するため、
// `room_full` のような **HTTP ステータスが存在しないコード**を errorCodeSchema へ
// 直接足すと、意味の無い対応表を書くはめになる。
//
// そこで **REST のコードを含む上位集合**として WS 側を定義する。
// これで「同じ snake_case 空間を共有する」を満たしつつ、
// `errorStatusByCode` は REST のコードだけを網羅すればよくなる（Issue #10 で合意）。

/** WS 専用のエラーコード（REST では返らない） */
const wsOnlyErrorCodes = [
	// ロビー（② §3-B）
	'queue_already_joined',
	'already_in_room',
	'already_in_game',
	'not_leader',
	'room_not_found',
	'room_full',
	'not_host',
	'room_starting',
	'invalid_rules',
	// ゲーム（② §5-A）
	'not_participant',
	'invalid_slot',
	// プロトコル（② §2-A）。`payload_too_large` は REST 側に既にあるので足さない
	'unknown_message',
] as const;

export const wsErrorCodeSchema = z.enum([...errorCodeSchema.options, ...wsOnlyErrorCodes]);

export type WsErrorCode = z.infer<typeof wsErrorCodeSchema>;

/** `{ t: "error", d: { code, msg, ref? } }`。`ref` は原因になったメッセージの `t` */
export const wsErrorSchema = z.object({
	t: z.literal('error'),
	d: z.object({
		code: wsErrorCodeSchema,
		msg: z.string(),
		ref: z.string().optional(),
	}),
});

export type WsError = z.infer<typeof wsErrorSchema>;

export function makeWsError(code: WsErrorCode, msg: string, ref?: string): WsError {
	return { t: 'error', d: { code, msg, ...(ref ? { ref } : {}) } };
}
