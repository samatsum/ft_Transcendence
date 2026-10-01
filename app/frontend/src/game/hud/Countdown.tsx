import { SCRIM_70 } from '../../components/rawColors.js';

// ④ §3.3 HUD 表 カウントダウン:
//   3・2・1 の全画面オーバーレイ → match_start で消える
// state は useHudState が管理(seconds を1秒ずつ刻む)

interface CountdownProps {
	seconds: number | null;
}

export function Countdown({ seconds }: CountdownProps) {
	if (seconds === null) return null;
	// 0 は「消える寸前」表示(次の tick で null になる)。ここでは "GO!" を出す
	const display = seconds === 0 ? 'GO!' : String(seconds);
	return (
		<div
			role="status"
			aria-live="assertive"
			className="pointer-events-none absolute inset-0 flex items-center justify-center"
		>
			{/* 3D の上のスクリム。トークンに寄せない理由は rawColors.ts（#167, #223） */}
			<div className={`rounded-full ${SCRIM_70} px-12 py-8 font-mono text-8xl font-bold text-fg-strong shadow-2xl`}>
				{display}
			</div>
		</div>
	);
}
