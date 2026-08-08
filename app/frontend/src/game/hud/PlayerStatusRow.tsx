import { useEffect, useState } from 'react';
import type { SeatInfo } from '../hudState.js';

// ④ §3.3 HUD 表 対戦者ステータス行:
//   各席: 名前 + 状態バッジ `connected / 切断中(残n秒) / AI`
// - grace は残秒表示(1秒間隔で描画更新)
// - 「名前」は placeholder(GV-07 では slot 番号 + AI 判定)。実名は shared 拡張の別 PR

interface PlayerStatusRowProps {
	seats: Map<number, SeatInfo>;
	/** 自席の slot(強調表示用) */
	selfSlot: number | null;
}

const STATE_LABEL: Record<SeatInfo['state'], string> = {
	connected: '接続中',
	grace: '切断中',
	ai: 'AI',
};

const STATE_CLASS: Record<SeatInfo['state'], string> = {
	connected: 'bg-emerald-700 text-emerald-100',
	grace: 'bg-amber-700 text-amber-100',
	ai: 'bg-slate-600 text-slate-200',
};

function SeatBadge({ seat, isSelf, nowMs }: { seat: SeatInfo; isSelf: boolean; nowMs: number }) {
	const remaining =
		seat.state === 'grace' && seat.graceDeadlineMs !== null
			? Math.max(0, Math.ceil((seat.graceDeadlineMs - nowMs) / 1000))
			: null;
	return (
		<div
			className={`flex items-center gap-2 rounded px-2 py-1 text-xs ${
				isSelf ? 'ring-1 ring-sky-400' : ''
			} bg-black/60`}
		>
			<span className="text-slate-100">{seat.name}</span>
			<span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATE_CLASS[seat.state]}`}>
				{STATE_LABEL[seat.state]}
				{remaining !== null && ` (残${remaining}秒)`}
			</span>
		</div>
	);
}

export function PlayerStatusRow({ seats, selfSlot }: PlayerStatusRowProps) {
	// grace の残秒数を1秒ごとに再描画する。grace が無ければ tick を止める
	const hasGrace = Array.from(seats.values()).some((s) => s.state === 'grace');
	const [nowMs, setNowMs] = useState(() => performance.now());
	useEffect(() => {
		if (!hasGrace) return;
		const id = setInterval(() => setNowMs(performance.now()), 500);
		return () => clearInterval(id);
	}, [hasGrace]);

	const items = Array.from(seats.values()).sort((a, b) => a.slot - b.slot);
	return (
		<div className="pointer-events-none absolute right-4 top-4 flex flex-col items-end gap-1">
			{items.map((seat) => (
				<SeatBadge key={seat.slot} seat={seat} isSelf={seat.slot === selfSlot} nowMs={nowMs} />
			))}
		</div>
	);
}
