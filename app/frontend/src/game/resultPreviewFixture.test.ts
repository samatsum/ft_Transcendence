import { describe, expect, it } from 'vitest';

import { describeResultMessage, describeWinner } from './hud/MatchEndModal.js';
import { fpsForfeitResultPreview, fpsGoalResultPreview } from './resultPreviewFixture.js';

describe('FPS result preview fixture', () => {
	it('通常のゴール決着を本番コンポーネントへ渡す', () => {
		expect(fpsGoalResultPreview).toEqual({
			winner: 1,
			reason: 'goal',
			matchId: null,
			finalScore: [5, 2],
		});
		expect(describeWinner(fpsGoalResultPreview, 'fps')).toBe('Player 1 の勝利');
		expect(describeResultMessage(fpsGoalResultPreview.reason)).toBe(
			'ゴールに到達して試合が終了しました',
		);
	});

	it('不戦勝では退出または切断の説明を本番コンポーネントへ渡す', () => {
		expect(fpsForfeitResultPreview).toEqual({
			winner: 0,
			reason: 'forfeit',
			matchId: null,
			finalScore: [0, 0],
		});
		expect(describeWinner(fpsForfeitResultPreview, 'fps')).toBe('Player 0 の勝利');
		expect(describeResultMessage(fpsForfeitResultPreview.reason)).toBe(
			'プレイヤーの退出または切断により試合が終了しました',
		);
	});
});
