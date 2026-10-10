import { SCRIM_60 } from '../../components/rawColors.js';

// #269 試合の残り時間。ScoreBar の直下に置く（上端中央は ScoreBar、右上は対戦者ステータス行）。
// 値の正本は snapshot.match.time_left_ms で、useHudState が 200ms ごとに取り込む

interface MatchTimerProps {
	/** null なら制限時間なし（または snapshot 未着）として表示しない */
	timeLeftMs: number | null;
}

/** 残りがこれ以下になったら色を変えて終わりが近いことを知らせる */
const WARN_MS = 30_000;

/**
 * 残り時間を `m:ss` にする。秒は切り上げ（残り 0.4 秒を `0:00` と出して、
 * まだ試合が続いているのに時間切れに見えるのを避ける）
 */
export function formatTimeLeft(ms: number): string {
	const total = Math.max(0, Math.ceil(ms / 1000));
	const minutes = Math.floor(total / 60);
	const seconds = total % 60;
	return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function MatchTimer({ timeLeftMs }: MatchTimerProps) {
	if (timeLeftMs === null) return null;
	const warn = timeLeftMs <= WARN_MS;
	return (
		<div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
			{/* 3D の上のスクリム。トークンに寄せない理由は rawColors.ts（#167, #223） */}
			<div
				className={`rounded-md ${SCRIM_60} px-3 py-0.5 font-mono text-body font-semibold ${
					warn ? 'text-danger-bright' : 'text-fg'
				}`}
				aria-label={`残り時間 ${formatTimeLeft(timeLeftMs)}`}
			>
				{formatTimeLeft(timeLeftMs)}
			</div>
		</div>
	);
}
