import { z } from 'zod';

import { matchEndReasonSchema } from './game.js';

// ② §3-A / §6-C: W-09/W-13 の結合に先立って確定させる lobby match_result 契約。
// 残りのロビー WS メッセージは W-08 で本ファイルへ追加する。

export const matchPlayerResultSchema = z.enum(['win', 'lose', 'draw', 'abandon']);

export const matchResultPayloadSchema = z
	.object({
		match_id: z.number().int().positive(),
		mode: z.enum(['rsp', 'fps']),
		end_reason: matchEndReasonSchema,
		winner_team: z.union([z.literal(0), z.literal(1)]).nullable(),
		winner_user_id: z.number().int().positive().nullable(),
		players: z.array(
			z
				.object({
					user_id: z.number().int().positive().nullable(),
					display_name: z.string().min(1),
					is_ai: z.boolean(),
					team: z.number().int().nonnegative(),
					slot: z.number().int().nonnegative(),
					result: matchPlayerResultSchema,
				})
				.strict(),
		),
	})
	.strict();

export type MatchResultPayload = z.infer<typeof matchResultPayloadSchema>;
