import { Button } from '../../components/Button.js';
import { Modal } from '../../components/Modal.js';
import type { MatchEndState } from '../hudState.js';

// ④ §3.3 HUD 表 match_end モーダル:
//   勝敗・最終スコア・「ロビーへ戻る」。
//   match_id が正整数なら REST から各プレイヤー成績も表示、null なら保存失敗を通知し
//   最終 snapshot だけで結果表示
// GV-07 の推奨決定#4: /api/matches/:id は toast:false で試み、B-13 未完成期間は
// 失敗を握って snapshot だけで表示。matchDetails は親から渡す(fetch は GameView 側)

interface MatchEndModalProps {
	end: MatchEndState;
	mode: 'rsp' | 'fps';
	/** 詳細取得の状態(B-13 完成前は常に null) */
	matchDetails: MatchDetailsView | null;
	detailsError: boolean;
	onReturnToLobby: () => void;
}

/** GET /api/matches/:id の要約(B-13 完成時に shared 側で確定させる予定) */
export interface MatchDetailsView {
	players: Array<{
		display_name: string;
		is_ai: boolean;
		team: number;
		slot: number;
		result: 'win' | 'lose' | 'draw' | 'abandon';
	}>;
}

function describeWinner(end: MatchEndState, mode: 'rsp' | 'fps'): string {
	if (end.reason === 'abandon') return '試合が打ち切られました';
	if (end.winner === null) return '引き分け';
	if (mode === 'rsp') {
		return end.winner === 0 ? '赤チームの勝利' : '青チームの勝利';
	}
	// FPS: winner は combatant_id
	return `Player ${end.winner} の勝利`;
}

const REASON_LABEL: Record<MatchEndState['reason'], string> = {
	score: '先取点到達',
	goal: 'ゴール到達',
	forfeit: '不戦勝',
	abandon: '打ち切り',
};

export function MatchEndModal({
	end,
	mode,
	matchDetails,
	detailsError,
	onReturnToLobby,
}: MatchEndModalProps) {
	return (
		<Modal
			open
			onClose={onReturnToLobby}
			title={describeWinner(end, mode)}
			actions={
				<Button variant="primary" onClick={onReturnToLobby}>
					ロビーへ戻る
				</Button>
			}
		>
			<div className="flex flex-col gap-3">
				<p className="text-body text-slate-300">
					事由: {REASON_LABEL[end.reason]} ／ 最終スコア:{' '}
					<span className="font-mono">{end.finalScore[0]} - {end.finalScore[1]}</span>
				</p>
				{matchDetails && matchDetails.players.length > 0 && (
					<table className="w-full text-caption">
						<thead>
							<tr className="border-b border-slate-700 text-left text-slate-400">
								<th className="py-1">Slot</th>
								<th className="py-1">名前</th>
								<th className="py-1">結果</th>
							</tr>
						</thead>
						<tbody>
							{matchDetails.players.map((p) => (
								<tr key={p.slot} className="border-b border-slate-800">
									<td className="py-1">{p.slot}</td>
									<td className="py-1">{p.display_name}{p.is_ai && ' (AI)'}</td>
									<td className="py-1">{p.result}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
				{end.matchId === null && (
					<p className="text-caption text-amber-400">
						※ 試合の永続化に失敗したため、詳細は表示できません(最終 snapshot のみ)。
					</p>
				)}
				{end.matchId !== null && !matchDetails && !detailsError && (
					<p className="text-caption text-slate-500">試合詳細を取得しています…</p>
				)}
				{detailsError && (
					<p className="text-caption text-slate-500">試合詳細の取得に失敗しました(最終 snapshot のみ表示)。</p>
				)}
			</div>
		</Modal>
	);
}
