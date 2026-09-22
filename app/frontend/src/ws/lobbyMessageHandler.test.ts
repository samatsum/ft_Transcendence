import { WS_PROTOCOL_VERSION } from '@ft/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../devLog.js', () => ({ devLog: vi.fn() }));

import { devLog } from '../devLog.js';
import { handleLobbyServerMessage } from './lobbyMessageHandler.js';

afterEach(() => {
	vi.clearAllMocks();
});

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

describe('ロビー受信フレームの診断', () => {
	it('壊れた JSON は raw 値と解析失敗を devLog へ渡す', () => {
		handleLobbyServerMessage('{broken', vi.fn());

		expectDiagnostic('ロビー WS: JSON の解析に失敗したため受信メッセージを破棄しました', '{broken', false);
	});

	it('schema に合わない message は Zod issue を devLog へ渡す', () => {
		const raw = { t: 'unexpected', d: {} };
		handleLobbyServerMessage(JSON.stringify(raw), vi.fn());

		expectDiagnostic('ロビー WS: スキーマ検証に失敗したため受信メッセージを破棄しました', raw, true);
	});

	it('正しい lobby_hello だけを呼び出し元へ渡す', () => {
		const onMessage = vi.fn();
		const message = {
			t: 'lobby_hello',
			d: {
				v: WS_PROTOCOL_VERSION,
				online_count: 1,
				self: { status: 'online' },
			},
		};

		handleLobbyServerMessage(JSON.stringify(message), onMessage);

		expect(onMessage).toHaveBeenCalledWith(message);
		expect(devLog).not.toHaveBeenCalled();
	});
});
