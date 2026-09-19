import type { MatchEndState } from './hudState.js';

/** Vite 開発時のリザルト確認にだけ使う、通常の FPS ゴール結果 */
export const fpsGoalResultPreview: MatchEndState = {
	winner: 1,
	reason: 'goal',
	matchId: null,
	finalScore: [5, 2],
};

/** Vite 開発時のリザルト確認にだけ使う、FPS の不戦勝結果 */
export const fpsForfeitResultPreview: MatchEndState = {
	winner: 0,
	reason: 'forfeit',
	matchId: null,
	finalScore: [0, 0],
};
	
