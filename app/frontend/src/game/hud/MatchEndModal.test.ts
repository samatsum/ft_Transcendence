import { describe, expect, it } from 'vitest';

import { describeResultMessage, describeWinner } from './MatchEndModal.js';

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

	it('RSP観戦者には打ち切りの見出しと理由を表示する', () => {
		expect(describeWinner({
			winner: null,
			reason: 'abandon',
			matchId: null,
			finalScore: [0, 0],
		}, 'rsp')).toBe('試合が打ち切られました');
		expect(describeResultMessage('abandon')).toBe(
			'参加者がいなくなったため試合を打ち切りました',
		);
	});

	it('時間切れでは理由を説明し、勝者なしは引き分けと表示する', () => {
		expect(describeResultMessage('timeout')).toBe('制限時間に達したため試合が終了しました');
		expect(describeWinner({
			winner: null,
			reason: 'timeout',
			matchId: null,
			finalScore: [2, 2],
		}, 'rsp')).toBe('引き分け');
		expect(describeWinner({
			winner: 0,
			reason: 'timeout',
			matchId: null,
			finalScore: [3, 1],
		}, 'rsp')).toBe('赤チームの勝利');
	});
});
