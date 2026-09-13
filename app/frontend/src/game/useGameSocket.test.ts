import { describe, expect, it } from 'vitest';

import {
	acknowledgeGameEvents,
	enqueueGameEvent,
	shouldReturnToLobby,
} from './useGameSocket.js';

describe('game event queue', () => {
	it('同じ描画前に届いた event を到着順に保持する', () => {
		const point = { kind: 'point_scored' as const, team: 0, score: [3, 0] as [number, number], by_id: null };
		const end = { kind: 'match_end' as const, winner: 0, reason: 'score' as const, match_id: null };
		const queued = enqueueGameEvent(enqueueGameEvent([], 1, point), 2, end);

		expect(queued.map(({ event }) => event.kind)).toEqual(['point_scored', 'match_end']);
	});

	it('確認済み id までだけを除き、後から追加された event を残す', () => {
		const start = { kind: 'match_start' as const };
		const goal = { kind: 'goal' as const, id: 1 };
		const end = { kind: 'match_end' as const, winner: 1, reason: 'goal' as const, match_id: null };
		let queued = enqueueGameEvent([], 1, start);
		queued = enqueueGameEvent(queued, 2, goal);
		queued = enqueueGameEvent(queued, 3, end);

		expect(acknowledgeGameEvents(queued, 2)).toEqual([{ id: 3, event: end }]);
	});
});

describe('game close navigation', () => {
	it('終了済みルームへの再 join が 4003 で拒否されたらロビーへ戻す', () => {
		expect(shouldReturnToLobby(4003)).toBe(true);
	});

	it('正常終了と消滅済みルームでもロビーへ戻す', () => {
		expect(shouldReturnToLobby(1000)).toBe(true);
		expect(shouldReturnToLobby(4002)).toBe(true);
	});

	it('再接続対象や別タブ置換では自動遷移しない', () => {
		expect(shouldReturnToLobby(null)).toBe(false);
		expect(shouldReturnToLobby(1006)).toBe(false);
		expect(shouldReturnToLobby(4004)).toBe(false);
	});
});
