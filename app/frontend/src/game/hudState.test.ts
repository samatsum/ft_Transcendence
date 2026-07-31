import { describe, expect, it } from 'vitest';
import type { SnapshotPayload } from '@ft/shared';

import {
	applyGameEvent,
	applyPlayerStatus,
	createInitialHudState,
	expireFlashes,
	seatsFromSnapshot,
} from './hudState.js';

function combatant(id: number, is_ai: boolean): SnapshotPayload['combatants'][0] {
	return { id, team: 0, hand: 0, pos: [0, 0], dir: 0, alive: true, is_ai, respawn_ms: 0 };
}

describe('seatsFromSnapshot', () => {
	it('is_ai=true は AI、false は Player {slot} で seat を初期化', () => {
		const seats = seatsFromSnapshot([combatant(0, false), combatant(1, true), combatant(2, false)]);
		expect(seats.get(0)?.state).toBe('connected');
		expect(seats.get(0)?.name).toBe('Player 0');
		expect(seats.get(1)?.state).toBe('ai');
		expect(seats.get(1)?.name).toBe('AI');
		expect(seats.get(2)?.state).toBe('connected');
	});
});

describe('applyPlayerStatus', () => {
	it('grace のとき graceDeadlineMs = now + graceMs を刻む', () => {
		const state = { ...createInitialHudState(), seats: seatsFromSnapshot([combatant(0, false)]) };
		const next = applyPlayerStatus(state, { slot: 0, state: 'grace' }, 1000, 30000);
		expect(next.seats.get(0)?.state).toBe('grace');
		expect(next.seats.get(0)?.graceDeadlineMs).toBe(31000);
	});

	it('connected へ戻したら graceDeadlineMs は null に戻る', () => {
		const state = { ...createInitialHudState(), seats: seatsFromSnapshot([combatant(0, false)]) };
		const graced = applyPlayerStatus(state, { slot: 0, state: 'grace' }, 1000);
		const back = applyPlayerStatus(graced, { slot: 0, state: 'connected' }, 2000);
		expect(back.seats.get(0)?.state).toBe('connected');
		expect(back.seats.get(0)?.graceDeadlineMs).toBeNull();
	});
});

describe('applyGameEvent — countdown / match_start', () => {
	it('countdown で seconds を保持し、match_start で null に戻る', () => {
		const s0 = createInitialHudState();
		const s1 = applyGameEvent(s0, { kind: 'countdown', seconds: 3 }, 0);
		expect(s1.countdownSeconds).toBe(3);
		expect(s1.matchStarted).toBe(false);
		const s2 = applyGameEvent(s1, { kind: 'match_start' }, 0);
		expect(s2.countdownSeconds).toBeNull();
		expect(s2.matchStarted).toBe(true);
	});
});

describe('applyGameEvent — point_scored / hand_changed', () => {
	it('point_scored で score を更新、フラッシュ expires を刻む', () => {
		const s0 = createInitialHudState();
		const s1 = applyGameEvent(s0, { kind: 'point_scored', team: 1, score: [3, 5], by_id: null }, 1000);
		expect(s1.score).toEqual([3, 5]);
		expect(s1.pointFlash?.team).toBe(1);
		expect(s1.pointFlash?.expiresAtMs).toBeGreaterThan(1000);
	});

	it('hand_changed でフラッシュ state を刻む', () => {
		const s0 = createInitialHudState();
		const s1 = applyGameEvent(s0, { kind: 'hand_changed', id: 0, hand: 2 }, 500);
		expect(s1.handFlash?.hand).toBe(2);
	});
});

describe('applyGameEvent — player_disconnected/reconnected/ai_takeover', () => {
	it('player_disconnected は grace へ、grace_ms で deadline を刻む', () => {
		const s0 = { ...createInitialHudState(), seats: seatsFromSnapshot([combatant(1, false)]) };
		const s1 = applyGameEvent(
			s0,
			{ kind: 'player_disconnected', slot: 1, grace_ms: 30000 },
			5000,
		);
		expect(s1.seats.get(1)?.state).toBe('grace');
		expect(s1.seats.get(1)?.graceDeadlineMs).toBe(35000);
	});

	it('ai_takeover は ai へ、graceDeadlineMs は null', () => {
		const s0 = {
			...createInitialHudState(),
			seats: applyPlayerStatus(createInitialHudState(), { slot: 2, state: 'grace' }, 0).seats,
		};
		const s1 = applyGameEvent(s0, { kind: 'ai_takeover', slot: 2 }, 100);
		expect(s1.seats.get(2)?.state).toBe('ai');
		expect(s1.seats.get(2)?.graceDeadlineMs).toBeNull();
	});
});

describe('applyGameEvent — match_end', () => {
	it('match_end で finalScore を snapshot 由来の score で確定', () => {
		const s0 = { ...createInitialHudState(), score: [10, 3] as [number, number] };
		const s1 = applyGameEvent(
			s0,
			{ kind: 'match_end', winner: 0, reason: 'score', match_id: 42 },
			0,
		);
		expect(s1.matchEnd).toEqual({
			winner: 0,
			reason: 'score',
			matchId: 42,
			finalScore: [10, 3],
		});
	});

	it('match_id が null(永続化失敗) でも matchEnd は成立', () => {
		const s0 = createInitialHudState();
		const s1 = applyGameEvent(
			s0,
			{ kind: 'match_end', winner: null, reason: 'abandon', match_id: null },
			0,
		);
		expect(s1.matchEnd?.matchId).toBeNull();
	});
});

describe('expireFlashes', () => {
	it('point/hand の期限切れを両方消す', () => {
		const s0 = createInitialHudState();
		const s1 = applyGameEvent(s0, { kind: 'point_scored', team: 0, score: [1, 0], by_id: null }, 0);
		const s2 = applyGameEvent(s1, { kind: 'hand_changed', id: 0, hand: 1 }, 0);
		// 期限は POINT=500ms, HAND=300ms(defaults)。now=1000 なら両方 expired
		const s3 = expireFlashes(s2, 1000);
		expect(s3.pointFlash).toBeNull();
		expect(s3.handFlash).toBeNull();
	});

	it('未期限なら状態を保つ(参照も変えない)', () => {
		const s0 = createInitialHudState();
		const s1 = applyGameEvent(s0, { kind: 'point_scored', team: 1, score: [0, 1], by_id: null }, 100);
		const s2 = expireFlashes(s1, 200); // まだ 500ms 経ってない
		expect(s2).toBe(s1); // 同一参照
	});
});
