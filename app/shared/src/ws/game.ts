import { z } from 'zod';

import { WS_PROTOCOL_VERSION } from './envelope.js';

// ② §5 ゲーム WS 仕様（`/ws/game/:roomId`）。
//
// **FE/BE がこのファイルだけを見て通信できること**が目的。サーバ（W-11）は
// クライアントから来たものを `.parse()` し、クライアント（F-06）は受け取ったものを
// `.parse()` する。同じ定義を両側が使うので、片側だけ直して壊れることがない
// （課題書 III.3「フロント/バック双方での入力検証」の充足箇所）。

/* ── クライアント → サーバ（② §5-A） ─────────────────────────────── */

/** `join`: Cookie とルームの participant 登録で本人特定。ペイロード不要 */
export const gameJoinSchema = z.object({
	t: z.literal('join'),
	d: z.object({}).optional(),
});

/**
 * `input`: 30Hz 固定送信。**表示フレームから間引いて全量状態を送る**（状態駆動）。
 * 取りこぼしても次のメッセージが全量なので自己回復する（② §5-A 送信規約）。
 */
export const gameInputSchema = z.object({
	t: z.literal('input'),
	d: z.object({
		/** uint32 単調増加。サーバは「最後に受理した seq」より小さいものを黙って破棄 */
		seq: z.number().int().nonnegative(),
		/**
		 * 絶対角・ラジアン。視点回転はクライアント権威（② §5-C）なので
		 * サーバは範囲検証をしない。**NaN / Infinity だけはここで弾く**
		 * （3-エンジンPhase3レポート の W-10 申し送り 7）。
		 */
		yaw: z.number().finite(),
		/** 4bit ビットマスク: bit0=前進 / bit1=後退 / bit2=左strafe / bit3=右strafe */
		mv: z.number().int().min(0).max(0b1111),
		/** 既存エンジンの武器/射撃状態との互換予約。本プロジェクトの両モードでは 0 固定 */
		act: z.number().int().min(0).max(0b1111).optional(),
	}),
});

/** `leave`: 明示的な投了/退室。切断猶予を待たず即 AI 化（FPS は即不戦勝） */
export const gameLeaveSchema = z.object({
	t: z.literal('leave'),
	d: z.object({}).optional(),
});

/** `spectate`: 観戦参加（保1。② §5-E。実装は余力時のみ） */
export const gameSpectateSchema = z.object({
	t: z.literal('spectate'),
	d: z.object({}).optional(),
});

/** クライアント→サーバの全種。W-11 はこれで `.parse()` して不正を弾く（受入条件 №6） */
export const gameClientMessageSchema = z.discriminatedUnion('t', [
	gameJoinSchema,
	gameInputSchema,
	gameLeaveSchema,
	gameSpectateSchema,
]);

export type GameClientMessage = z.infer<typeof gameClientMessageSchema>;
export type GameInput = z.infer<typeof gameInputSchema>['d'];

/* ── snapshot ペイロード（② §5-C） ───────────────────────────────── */

/** sim の enum そのまま。countdown はルーム層の event で表現し sim を拡張しない */
export const matchStateSchema = z.enum(['waiting', 'playing', 'finished']);
export type MatchState = z.infer<typeof matchStateSchema>;

export const combatantViewSchema = z.object({
	/**
	 * 席 id。**snapshot 内の並び順とは無関係**なので必ずこれで照合する
	 * （W-10 申し送り 4。内部リストは生成の逆順）。
	 * マップ由来の敵ハザードは id=8 以降（`sim.h` の `SIM_HAZARD_ID_BASE`）。
	 */
	id: z.number(),
	team: z.number(),
	/** じゃんけんの手 0/1/2。**サーバ権威の状態**で、input からは送れない（D-17） */
	hand: z.number(),
	pos: z.tuple([z.number(), z.number()]),
	dir: z.number(),
	alive: z.boolean(),
	is_ai: z.boolean(),
	respawn_ms: z.number(),
});

export type CombatantView = z.infer<typeof combatantViewSchema>;

export const snapshotPayloadSchema = z.object({
	/** サーバ tick 番号（30Hz カウント。配信は偶数 tick = 15Hz）。sim は tick を持たない */
	tick: z.number(),
	match: z.object({
		state: matchStateSchema,
		/** RSP=チーム番号 / FPS=combatant_id / 未決着=null */
		winner: z.number().nullable(),
		score: z.tuple([z.number(), z.number()]),
	}),
	combatants: z.array(combatantViewSchema),
	/** 収集済みアイテム座標・扉開放フラグ。**変化時のみ・FPS のみ**（差分） */
	world_delta: z
		.object({
			collected: z.array(z.tuple([z.number(), z.number()])).optional(),
			doors_open: z.boolean().optional(),
		})
		.optional(),
});

export type SnapshotPayload = z.infer<typeof snapshotPayloadSchema>;

export const snapshotMessageSchema = z.object({
	t: z.literal('snapshot'),
	d: snapshotPayloadSchema,
});

export type SnapshotMessage = z.infer<typeof snapshotMessageSchema>;

/* ── event 種別（② §5-D） ────────────────────────────────────────── */

// **イベントは演出・通知のトリガであり、状態の正本は常に snapshot**。
// 取りこぼしても snapshot で追いつく設計なので、再接続時に再送はしない。

/** ② §5-D: match_end の理由 */
export const matchEndReasonSchema = z.enum(['score', 'goal', 'forfeit', 'abandon']);
export type MatchEndReason = z.infer<typeof matchEndReasonSchema>;

export const gameEventSchema = z.object({
	t: z.literal('event'),
	d: z.discriminatedUnion('kind', [
		z.object({ kind: z.literal('countdown'), seconds: z.number() }),
		z.object({ kind: z.literal('match_start') }),
		z.object({
			kind: z.literal('point_scored'),
			team: z.number(),
			score: z.tuple([z.number(), z.number()]),
			/** 誰が取ったか。snapshot に情報が無いため現状は常に null（拡張は ② の改訂が先） */
			by_id: z.number().nullable(),
		}),
		z.object({ kind: z.literal('hand_changed'), id: z.number(), hand: z.number() }),
		z.object({ kind: z.literal('goal'), id: z.number() }),
		z.object({
			kind: z.literal('match_end'),
			winner: z.number().nullable(),
			reason: matchEndReasonSchema,
			/** 永続化済み DB 行の id。W-13 が採番するまで null */
			match_id: z.string().nullable(),
		}),
		z.object({ kind: z.literal('player_disconnected'), slot: z.number(), grace_ms: z.number() }),
		z.object({ kind: z.literal('player_reconnected'), slot: z.number() }),
		z.object({ kind: z.literal('ai_takeover'), slot: z.number() }),
	]),
});

export type GameEvent = z.infer<typeof gameEventSchema>;
export type GameEventKind = GameEvent['d']['kind'];

/* ── サーバ → クライアント（② §5-B） ─────────────────────────────── */

/** join / spectate 受理直後に1回だけ送る。**接続ごとに内容が違う**（slot / role） */
export const welcomeMessageSchema = z.object({
	t: z.literal('welcome'),
	d: z.object({
		v: z.literal(WS_PROTOCOL_VERSION),
		role: z.enum(['player', 'spectator']),
		slot: z.number().nullable(),
		combatant_id: z.number().nullable(),
		mode: z.enum(['rsp', 'fps']),
		rules: z.object({ target_score: z.number() }),
		/**
		 * サーバがロード済みの `.cub` テキストをそのまま同梱する（② §5-B の決定）。
		 * これでサーバとクライアントのマップ不一致が**原理的に起きない**。
		 */
		map_text: z.string(),
		tick_rate: z.number(),
		snap_rate: z.number(),
		interp_ms: z.number(),
		/** 再接続で復帰したか（初回参加は false） */
		resume: z.boolean(),
	}),
});

export type WelcomeMessage = z.infer<typeof welcomeMessageSchema>;

/** 席の人間/AI 切替時に配信（② §5-B。grace = 切断猶予中） */
export const playerStatusMessageSchema = z.object({
	t: z.literal('player_status'),
	d: z.object({
		slot: z.number(),
		state: z.enum(['connected', 'ai', 'grace']),
	}),
});

export type PlayerStatusMessage = z.infer<typeof playerStatusMessageSchema>;

/**
 * サーバ→クライアントの全種（`error` を除く。`error` は `ws/errors.ts`）。
 *
 * サーバは**この形で送るだけで `.parse()` しない**（自分が作ったものなので）。
 * 15Hz × ルーム数ぶん検証すると無駄。**受信側（F-06）が `.parse()` する**。
 */
export const gameServerMessageSchema = z.discriminatedUnion('t', [
	welcomeMessageSchema,
	snapshotMessageSchema,
	gameEventSchema,
	playerStatusMessageSchema,
]);

export type GameServerMessage = z.infer<typeof gameServerMessageSchema>;
