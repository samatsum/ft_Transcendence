import { z } from 'zod';

import { matchEndReasonSchema } from './game.js';
import { WS_PROTOCOL_VERSION } from './envelope.js';
import { wsErrorSchema } from './errors.js';

// W-08: ロビー WS（`/ws/lobby`）の単一情報源。FE/BE はこのファイルの
// discriminated union を共有し、独自の wire type を作らない（② §3）。

export const lobbyModeSchema = z.enum(['rsp', 'fps']);
export type LobbyMode = z.infer<typeof lobbyModeSchema>;

export const presenceStatusSchema = z.enum(['online', 'in_queue', 'in_game', 'offline']);
export type PresenceStatus = z.infer<typeof presenceStatusSchema>;

export const roomCodeSchema = z
	.string()
	.transform((code) => code.trim().toUpperCase())
	.pipe(z.string().regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/));

export const rspRulesSchema = z
	.object({
		map: z.string().min(1),
		target_score: z.number().int().min(3).max(21),
	})
	.strict();

export const fpsRulesSchema = z.object({ map: z.string().min(1) }).strict();

export const canonicalRulesSchema = z.union([rspRulesSchema, fpsRulesSchema]);
export type CanonicalRules = z.infer<typeof canonicalRulesSchema>;

const emptyPayloadSchema = z.object({}).strict().optional();

/* ── client → server ─────────────────────────────────────────────── */

export const lobbyQueueJoinSchema = z
	.object({
		t: z.literal('queue_join'),
		d: z.object({ mode: lobbyModeSchema }).strict(),
	})
	.strict();

export const lobbyQueueLeaveSchema = z
	.object({ t: z.literal('queue_leave'), d: emptyPayloadSchema })
	.strict();

export const lobbyQueueFillStartSchema = z
	.object({ t: z.literal('queue_fill_start'), d: emptyPayloadSchema })
	.strict();

export const lobbyRoomCreateSchema = z.discriminatedUnion('mode', [
	z
		.object({
			mode: z.literal('rsp'),
			rules: rspRulesSchema.partial().strict().optional(),
		})
		.strict(),
	z
		.object({
			mode: z.literal('fps'),
			rules: fpsRulesSchema.partial().strict().optional(),
		})
		.strict(),
]);

export const lobbyRoomCreateMessageSchema = z
	.object({ t: z.literal('room_create'), d: lobbyRoomCreateSchema })
	.strict();

export const lobbyRoomJoinSchema = z
	.object({
		t: z.literal('room_join'),
		d: z.object({ code: roomCodeSchema }).strict(),
	})
	.strict();

export const lobbyRoomLeaveSchema = z
	.object({ t: z.literal('room_leave'), d: emptyPayloadSchema })
	.strict();

export const lobbyRoomUpdateRulesSchema = z
	.object({
		t: z.literal('room_update_rules'),
		d: canonicalRulesSchema,
	})
	.strict();

export const lobbyRoomStartSchema = z
	.object({ t: z.literal('room_start'), d: emptyPayloadSchema })
	.strict();

export const lobbyClientMessageSchema = z.discriminatedUnion('t', [
	lobbyQueueJoinSchema,
	lobbyQueueLeaveSchema,
	lobbyQueueFillStartSchema,
	lobbyRoomCreateMessageSchema,
	lobbyRoomJoinSchema,
	lobbyRoomLeaveSchema,
	lobbyRoomUpdateRulesSchema,
	lobbyRoomStartSchema,
]);

export type LobbyClientMessage = z.infer<typeof lobbyClientMessageSchema>;

/* ── server → client ─────────────────────────────────────────────── */

export const lobbyHelloMessageSchema = z
	.object({
		t: z.literal('lobby_hello'),
		d: z
			.object({
				v: z.literal(WS_PROTOCOL_VERSION),
				online_count: z.number().int().nonnegative(),
				self: z.object({ status: presenceStatusSchema }).strict(),
			})
			.strict(),
	})
	.strict();

export const presenceUpdateMessageSchema = z
	.object({
		t: z.literal('presence_update'),
		d: z
			.object({
				user_id: z.number().int().positive(),
				status: presenceStatusSchema,
			})
			.strict(),
	})
	.strict();

export const queueStateMessageSchema = z
	.object({
		t: z.literal('queue_state'),
		d: z
			.object({
				mode: lobbyModeSchema,
				position: z.number().int().positive(),
				waiting: z.number().int().positive(),
				auto_fill_in_ms: z.number().int().nonnegative(),
				is_leader: z.boolean(),
			})
			.strict(),
	})
	.strict();

export const matchFoundMessageSchema = z
	.object({
		t: z.literal('match_found'),
		d: z
			.object({
				room_id: z.string().min(1),
				mode: lobbyModeSchema,
				slot: z.number().int().nonnegative(),
			})
			.strict(),
	})
	.strict();
export type MatchFoundMessage = z.infer<typeof matchFoundMessageSchema>;

export const lobbySeatSchema = z
	.object({
		slot: z.number().int().nonnegative(),
		user_id: z.number().int().positive().nullable(),
		display_name: z.string().min(1).nullable(),
		is_ai: z.boolean(),
	})
	.strict()
	.superRefine((seat, ctx) => {
		const isEmpty = seat.user_id === null && seat.display_name === null && !seat.is_ai;
		const isAi = seat.user_id === null && seat.display_name === 'AI' && seat.is_ai;
		const isHuman = seat.user_id !== null && seat.display_name !== null && !seat.is_ai;
		if (!isEmpty && !isAi && !isHuman) {
			ctx.addIssue({ code: 'custom', message: 'seat must be exactly empty, AI, or human' });
		}
	});

const roomStateBaseSchema = {
	code: roomCodeSchema,
	state: z.enum(['open', 'starting']),
	host_id: z.number().int().positive(),
	seats: z.array(lobbySeatSchema),
};

export const roomStatePayloadSchema = z.discriminatedUnion('mode', [
	z
		.object({
			...roomStateBaseSchema,
			mode: z.literal('rsp'),
			rules: rspRulesSchema,
		})
		.strict(),
	z
		.object({
			...roomStateBaseSchema,
			mode: z.literal('fps'),
			rules: fpsRulesSchema,
		})
		.strict(),
]);

export const roomStateMessageSchema = z
	.object({ t: z.literal('room_state'), d: roomStatePayloadSchema })
	.strict();

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

export const matchResultMessageSchema = z
	.object({ t: z.literal('match_result'), d: matchResultPayloadSchema })
	.strict();

export const lobbyServerMessageSchema = z.discriminatedUnion('t', [
	lobbyHelloMessageSchema,
	presenceUpdateMessageSchema,
	queueStateMessageSchema,
	matchFoundMessageSchema,
	roomStateMessageSchema,
	matchResultMessageSchema,
	wsErrorSchema,
]);

export type LobbySeat = z.infer<typeof lobbySeatSchema>;
export type RoomStatePayload = z.infer<typeof roomStatePayloadSchema>;
export type MatchResultPayload = z.infer<typeof matchResultPayloadSchema>;
export type LobbyServerMessage = z.infer<typeof lobbyServerMessageSchema>;
