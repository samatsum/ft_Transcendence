import { describe, expect, it } from 'vitest';

import { describeResultMessage } from './MatchEndModal.js';

describe('describeResultMessage', () => {
	it('通常のRSP決着では最終スコアと重複する説明を表示しない', () => {
		expect(describeResultMessage('score')).toBeNull();
	});

	it('FPSの通常決着ではゴール到達を説明する', () => {
		expect(describeResultMessage('goal')).toBe('ゴールに到達して試合が終了しました');
	});

	it('不戦勝では退出または切断による終了を説明する', () => {
		expect(describeResultMessage('forfeit')).toBe(
			'プレイヤーの退出または切断により試合が終了しました',
		);
	});

	it('打ち切りでは参加者がいなくなったことを説明する', () => {
		expect(describeResultMessage('abandon')).toBe(
			'参加者がいなくなったため試合を打ち切りました',
		);
	});
});
