import type { GameSocketStatus } from '../useGameSocket.js';

// ④ §3.3 HUD 表 自分の接続バナー:
//   自 WS 切断時「再接続中…」バナー + 自動再接続
//   復帰時 welcome.resume=true で「復帰しました」トースト
// 「復帰しました」トーストは F-02 の ToastProvider に push する形(useHudState 側で判定)。
// このコンポーネントはバナー表示だけを担う

interface ConnectionBannerProps {
	status: GameSocketStatus;
	closeCode: number | null;
}

export function ConnectionBanner({ status, closeCode }: ConnectionBannerProps) {
	if (status === 'open') return null;
	let label = '';
	let tone = 'bg-amber-900/90';
	if (status === 'connecting') label = '接続中…';
	else if (status === 'reconnecting') label = '再接続中…';
	else if (status === 'closed') {
		label = closeCode !== null ? `切断されました (code=${closeCode})` : '切断されました';
		tone = 'bg-rose-900/90';
	}
	return (
		<div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
			<div
				role="status"
				className={`rounded-md px-4 py-2 text-sm font-medium text-white shadow ${tone}`}
			>
				{label}
			</div>
		</div>
	);
}
