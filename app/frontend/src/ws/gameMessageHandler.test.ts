import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../devLog.js', () => ({ devLog: vi.fn() }));

import { devLog } from '../devLog.js';
import { handleGameServerMessage, type GameMessageHandlers } from './gameMessageHandler.js';

afterEach(() => {
	vi.clearAllMocks();
});

function createHandlers(): GameMessageHandlers {
	return {
		onWelcome: vi.fn(),
		onSnapshot: vi.fn(),
		onEvent: vi.fn(),
		onPlayerStatus: vi.fn(),
	};
}

function expectDiagnostic(message: string, raw: unknown, requiresIssues: boolean): void {
	expect(devLog).toHaveBeenCalledTimes(1);
	const [, details] = vi.mocked(devLog).mock.calls[0]!;
	expect(vi.mocked(devLog)).toHaveBeenCalledWith(message, expect.any(Object));
	expect(details).toMatchObject({ raw });
	if (requiresIssues) {
		expect(Array.isArray((details as { issues?: unknown }).issues)).toBe(true);
	} else {
		expect((details as { error?: unknown }).error).toBeInstanceOf(Error);
	}
}

describe('ゲーム受信フレームの診断', () => {
	it.each([
		['壊れた JSON', '{broken', 'ゲーム WS: JSON の解析に失敗したため受信メッセージを破棄しました', '{broken', false],
		['envelope 不一致', JSON.stringify({ t: 42, d: {} }), 'ゲーム WS: envelope 検証に失敗したため受信メッセージを破棄しました', { t: 42, d: {} }, true],
		['welcome 不一致', JSON.stringify({ t: 'welcome', d: {} }), 'ゲーム WS: welcome 検証に失敗したため受信メッセージを破棄しました', { t: 'welcome', d: {} }, true],
		['snapshot 不一致', JSON.stringify({ t: 'snapshot', d: {} }), 'ゲーム WS: snapshot 検証に失敗したため受信メッセージを破棄しました', { t: 'snapshot', d: {} }, true],
		['event 不一致', JSON.stringify({ t: 'event', d: { kind: 'unknown' } }), 'ゲーム WS: event 検証に失敗したため受信メッセージを破棄しました', { t: 'event', d: { kind: 'unknown' } }, true],
		['player_status 不一致', JSON.stringify({ t: 'player_status', d: {} }), 'ゲーム WS: player_status 検証に失敗したため受信メッセージを破棄しました', { t: 'player_status', d: {} }, true],
		['その他 message 不一致', JSON.stringify({ t: 'unexpected', d: {} }), 'ゲーム WS: メッセージ検証に失敗したため受信メッセージを破棄しました', { t: 'unexpected', d: {} }, true],
	] as const)('%s を受信すると devLog へ渡す', (_name, frame, message, raw, requiresIssues) => {
		handleGameServerMessage(frame, createHandlers());

		expectDiagnostic(message, raw, requiresIssues);
	});

	it('正しい player_status だけを呼び出し元へ渡す', () => {
		const handlers = createHandlers();
		const payload = { slot: 0, state: 'connected' as const };

		handleGameServerMessage(JSON.stringify({ t: 'player_status', d: payload }), handlers);

		expect(handlers.onPlayerStatus).toHaveBeenCalledWith(payload);
		expect(devLog).not.toHaveBeenCalled();
	});
});
