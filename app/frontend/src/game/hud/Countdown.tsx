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
			<div className="rounded-full bg-black/70 px-12 py-8 font-mono text-8xl font-bold text-white shadow-2xl">
				{display}
			</div>
		</div>
	);
}
