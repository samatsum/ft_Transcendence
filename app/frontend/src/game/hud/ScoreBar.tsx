// ④ §3.3 HUD 表 スコアバー:
//   RSP: [赤 7 - 4 青] チーム色付き
//   FPS: スコア非表示(レースなので進行状況 = 収集数 x/y。要 world_delta 集計)
//
// F-07 は snapshot.match.score を直接表示する MVP。FPS の収集数表示は
// snapshot.world_delta の全量把握が要り複雑なので、後続 PR で拡張。
// 「値の正本は snapshot、event は演出」原則(② §5-D)

interface ScoreBarProps {
	mode: 'rsp' | 'fps';
	score: [number, number];
	targetScore: number;
	/** 得点フラッシュ中のチーム(0=赤, 1=青)。null なら通常表示 */
	highlightTeam: number | null;
}

export function ScoreBar({ mode, score, targetScore, highlightTeam }: ScoreBarProps) {
	if (mode === 'fps') {
		// FPS は score が [0, 0] 固定(② §5-C)。ゴール到達までの進行はマップ内の
		// 収集アイテムで表現するが、そのカウントは world_delta 集計が要る(TODO)
		return (
			<div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
				<div className="rounded-md bg-black/60 px-4 py-1 text-sm text-slate-200">
					FPS — ゴールへ到達せよ
				</div>
			</div>
		);
	}
	const redActive = highlightTeam === 0;
	const blueActive = highlightTeam === 1;
	return (
		<div className="pointer-events-none absolute inset-x-0 top-4 flex justify-center">
			<div className="flex items-center gap-3 rounded-md bg-black/70 px-4 py-2 font-mono text-lg font-bold">
				<span
					className={`rounded px-2 py-0.5 transition-colors ${
						redActive ? 'bg-rose-600 text-white' : 'text-rose-400'
					}`}
					aria-label="赤チームのスコア"
				>
					{score[0]}
				</span>
				<span className="text-slate-500">/ {targetScore}</span>
				<span
					className={`rounded px-2 py-0.5 transition-colors ${
						blueActive ? 'bg-sky-600 text-white' : 'text-sky-400'
					}`}
					aria-label="青チームのスコア"
				>
					{score[1]}
				</span>
			</div>
		</div>
	);
}
