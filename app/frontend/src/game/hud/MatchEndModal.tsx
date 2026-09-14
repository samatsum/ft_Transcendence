import { Link } from 'react-router-dom';

import { Button } from '../../components/Button.js';
import { Modal } from '../../components/Modal.js';
import type { MatchEndState } from '../hudState.js';

// ④ §3.3 の match_end リザルト画面
// Web では React 側を結果表示の正本にし、
// 不透明な全画面背景で render.wasm のクリア画面を覆う

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

export function describeResultMessage(reason: MatchEndState['reason']): string | null {
	switch (reason) {
		case 'score':
			return null;
		case 'goal':
			return 'ゴールに到達して試合が終了しました';
		case 'forfeit':
			return 'プレイヤーの退出または切断により試合が終了しました';
		case 'abandon':
			return '参加者がいなくなったため試合を打ち切りました';
	}
}

export function MatchEndModal({
	end,
	mode,
	matchDetails,
	detailsError,
	onReturnToLobby,
}: MatchEndModalProps) {
	const resultMessage = describeResultMessage(end.reason);

	return (
		<Modal
			open
			onClose={onReturnToLobby}
			title={describeWinner(end, mode)}
			backdropClassName="bg-slate-950"
			panelClassName="max-w-xl border-slate-700 bg-slate-900 text-center [&_h2]:text-heading-lg"
			actions={
				<Button variant="primary" fullWidth onClick={onReturnToLobby}>
					ロビーへ戻る
				</Button>
			}
		>
			<div className="flex flex-col gap-5">
				<p className="text-label uppercase tracking-[0.2em] text-sky-400">Match Result</p>
				{mode === 'rsp' && (
					<div
						className="flex items-center justify-center gap-5 font-mono"
						aria-label={`最終スコア ${end.finalScore[0]} 対 ${end.finalScore[1]}`}
					>
						<div className="flex min-w-20 flex-col gap-1 text-rose-400">
							<span className="text-caption font-sans">RED</span>
							<span className="text-5xl font-semibold">{end.finalScore[0]}</span>
						</div>
						<span className="text-heading-md text-slate-500" aria-hidden>—</span>
						<div className="flex min-w-20 flex-col gap-1 text-sky-400">
							<span className="text-caption font-sans">BLUE</span>
							<span className="text-5xl font-semibold">{end.finalScore[1]}</span>
						</div>
					</div>
				)}
				{resultMessage && <p className="text-body text-slate-300">{resultMessage}</p>}
				{matchDetails && matchDetails.players.length > 0 && (
					<table className="w-full text-left text-caption">
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
				{end.matchId !== null && !matchDetails && !detailsError && (
					<p className="text-caption text-slate-500">試合詳細を取得しています…</p>
				)}
				{detailsError && (
					<p className="text-caption text-slate-500">試合詳細を取得できませんでした。</p>
				)}
				<nav className="flex items-center justify-center gap-3 text-caption text-slate-500">
					<Link to="/privacy" className="hover:text-slate-300">Privacy Policy</Link>
					<span aria-hidden>·</span>
					<Link to="/terms" className="hover:text-slate-300">Terms of Service</Link>
				</nav>
			</div>
		</Modal>
	);
}
