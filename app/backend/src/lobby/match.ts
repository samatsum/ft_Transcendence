// B-09: B-08 の immutable MatchPlan を B-10 の GameRoom へ変換する接着層。
//
// 生成成功までは lobby context を commit せず、5秒期限・生成失敗・古いtokenでは
// rollback/discardする。GameRoom終了は lifecycle hook で受け、in_matchをidleへ戻す。
import type { MatchResultPayload } from '@ft/shared';

import {
	closeRoom,
	createRoomFromRules,
} from '../game/rooms.js';
import type { GameRoom, RoomLifecycleReason, RoomState } from '../game/room.js';
import type { MatchPlanControls } from './ws.js';
import type { MatchPlan } from './state.js';

export interface PreparedMatchRoom {
	readonly roomId: string;
}

export interface PrepareMatchRoomOptions {
	mode: MatchPlan['mode'];
	rules: MatchPlan['rules'];
	participants: MatchPlan['participants'];
	humanSlots: number[];
	reservationToken: string;
	signal: AbortSignal;
	onLifecycle(state: RoomState, reason: RoomLifecycleReason): void;
	onMatchResult(result: MatchResultPayload): void;
}

export interface MatchPreparationOptions {
	createRoom?(options: PrepareMatchRoomOptions): Promise<PreparedMatchRoom>;
	discardRoom?(roomId: string): void;
	releaseMatch(userId: number, roomId: string): boolean;
	broadcastMatchResult(result: MatchResultPayload): void;
}

/**
 * MatchPlanからGameRoomを1件生成し、全参加者をtoken付きで一括commitする。
 *
 * Runtime側の5秒timerが先に発火した場合、signalはabort済みになる。room factoryが
 * cancellationを無視して遅れて成功してもcommitはfalseとなり、discard callbackで
 * 孤児ルームを必ず破棄する。
 */
export async function prepareMatch(
	plan: MatchPlan,
	controls: MatchPlanControls,
	options: MatchPreparationOptions,
): Promise<boolean> {
	const create = options.createRoom ?? defaultCreateRoom;
	const discard = options.discardRoom ?? closeRoom;
	let preparedRoomId: string | null = null;
	try {
		const room = await create({
			mode: plan.mode,
			rules: plan.rules,
			participants: plan.participants,
			humanSlots: [...plan.humanSlots],
			reservationToken: plan.token,
			signal: controls.signal,
			onLifecycle: (state) => {
				if (!preparedRoomId || (state !== 'finished' && state !== 'closed')) return;
				for (const participant of plan.participants) {
					options.releaseMatch(participant.userId, preparedRoomId);
				}
			},
			onMatchResult: (result) => options.broadcastMatchResult(result),
		});
		preparedRoomId = room.roomId;
		return controls.commit(room.roomId, () => discard(room.roomId));
	} catch {
		if (controls.signal.aborted) return false;
		controls.fail('match preparation failed');
		return false;
	}
}

/** 本番のGameRoom registry入口へB-09の生成オプションをそのまま渡す */
async function defaultCreateRoom(options: PrepareMatchRoomOptions): Promise<GameRoom> {
	return createRoomFromRules(options);
}
