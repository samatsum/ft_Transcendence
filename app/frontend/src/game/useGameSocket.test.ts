import { describe, expect, it } from 'vitest';

import {
	acknowledgeGameEvents,
	enqueueGameEvent,
	shouldNavigateAfterLeave,
	shouldReturnToLobby,
	shouldShowMatchEnd,
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
	it('idleでは終了済みルームへの再 join が 4003 で拒否されたらロビーへ戻す', () => {
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

	it('RSP退出確認の待機中は対象close codeすべてで自動遷移しない', () => {
		expect(shouldReturnToLobby(1000, 'waiting')).toBe(false);
		expect(shouldReturnToLobby(4002, 'waiting')).toBe(false);
		expect(shouldReturnToLobby(4003, 'waiting')).toBe(false);
	});

	it('退出確認に失敗しても正常終了と消滅済みルームならロビーへ戻す', () => {
		expect(shouldReturnToLobby(1000, 'failed')).toBe(true);
		expect(shouldReturnToLobby(4002, 'failed')).toBe(true);
		expect(shouldReturnToLobby(4003, 'failed')).toBe(false);
	});

	it('退出確認に失敗しても受信済み結果があれば結果画面に留まる', () => {
		expect(shouldReturnToLobby(1000, 'failed', true)).toBe(false);
		expect(shouldReturnToLobby(4002, 'failed', true)).toBe(false);
	});

	it('退出確認済みでは従来どおり対象close codeでロビーへ戻す', () => {
		expect(shouldReturnToLobby(4003, 'acknowledged')).toBe(true);
		expect(shouldReturnToLobby(1000, 'acknowledged')).toBe(true);
		expect(shouldReturnToLobby(4002, 'acknowledged')).toBe(true);
	});

	it('RSPはleave_ack後にだけ遷移する', () => {
		expect(shouldNavigateAfterLeave('rsp', 'waiting')).toBe(false);
		expect(shouldNavigateAfterLeave('rsp', 'acknowledged')).toBe(true);
	});

	it('FPSの明示退出は既存どおりleave送信後に遷移する', () => {
		expect(shouldNavigateAfterLeave('fps', 'waiting')).toBe(true);
	});

	it('観戦者を含む通常接続と退出確認失敗時は結果を表示し、退出中は隠す', () => {
		expect(shouldShowMatchEnd('idle')).toBe(true);
		expect(shouldShowMatchEnd('failed')).toBe(true);
		expect(shouldShowMatchEnd('waiting')).toBe(false);
		expect(shouldShowMatchEnd('acknowledged')).toBe(false);
	});

	it('match_endが先でもleave_ack後は結果を経由せずロビーへ直接戻る', () => {
		// leave送信 → match_end → leave_ack
		expect(shouldShowMatchEnd('waiting')).toBe(false);
		expect(shouldShowMatchEnd('acknowledged')).toBe(false);
		expect(shouldNavigateAfterLeave('rsp', 'acknowledged')).toBe(true);
	});

	it('leave_ackが先でも後着match_endを描画せずロビーへ直接戻る', () => {
		// leave送信 → leave_ack → match_end
		expect(shouldShowMatchEnd('acknowledged')).toBe(false);
		expect(shouldNavigateAfterLeave('rsp', 'acknowledged')).toBe(true);
	});

	it('FPS退出は結果を描画せずロビーへ直接戻る', () => {
		expect(shouldShowMatchEnd('waiting')).toBe(false);
		expect(shouldNavigateAfterLeave('fps', 'waiting')).toBe(true);
	});
});
