import { afterEach, describe, expect, it, vi } from 'vitest';

import { devLog } from './devLog.js';

afterEach(() => {
	vi.unstubAllEnvs();
	vi.restoreAllMocks();
});

describe('devLog', () => {
	it('開発時は診断情報を console.debug に出す', () => {
		vi.stubEnv('DEV', true);
		const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);
		const details = { raw: '{broken' };

		devLog('ゲーム WS: JSON の解析に失敗したため受信メッセージを破棄しました', details);

		expect(debug).toHaveBeenCalledWith(
			'ゲーム WS: JSON の解析に失敗したため受信メッセージを破棄しました',
			details,
		);
	});

	it('本番時は console.debug を出さない', () => {
		vi.stubEnv('DEV', false);
		const debug = vi.spyOn(console, 'debug').mockImplementation(() => undefined);

		devLog('ロビー WS: スキーマ検証に失敗したため受信メッセージを破棄しました');

		expect(debug).not.toHaveBeenCalled();
	});
});
