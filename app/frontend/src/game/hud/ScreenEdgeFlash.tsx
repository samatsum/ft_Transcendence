// ④ §3.3 HUD 表:
//   得点演出 → point_scored で得点チームの色に画面縁をフラッシュ + スコアバー強調
//   自分の手 → hand_changed(自分) 時は Canvas 縁のフラッシュのみ
// 両方とも「画面縁の色枠」なので1コンポーネントで表現

interface ScreenEdgeFlashProps {
	/** 得点フラッシュのチーム(0=赤, 1=青)。null なら非表示 */
	pointTeam: number | null;
	/** 自席の手変更フラッシュ。null なら非表示 */
	handChanged: number | null;
}

const TEAM_COLOR: Record<number, string> = {
	0: 'shadow-[inset_0_0_60px_20px_rgba(244,63,94,0.55)]', // 赤
	1: 'shadow-[inset_0_0_60px_20px_rgba(14,165,233,0.55)]', // 青
};

const HAND_COLOR = 'shadow-[inset_0_0_40px_10px_rgba(250,204,21,0.5)]'; // amber

export function ScreenEdgeFlash({ pointTeam, handChanged }: ScreenEdgeFlashProps) {
	if (pointTeam === null && handChanged === null) return null;
	// hand フラッシュは弱め、point フラッシュを優先合成する
	const teamShadow = pointTeam !== null ? TEAM_COLOR[pointTeam] ?? '' : '';
	const handShadow = handChanged !== null ? HAND_COLOR : '';
	return (
		<div
			aria-hidden
			className={`pointer-events-none absolute inset-0 ${teamShadow} ${handShadow}`}
		/>
	);
}
