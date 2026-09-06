import { useNavigate } from 'react-router-dom';

import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useLobby } from '../contexts/LobbyContext.js';

// F-05 ロビーの入口となるハブ画面。「部屋を作る」「部屋に参加する」の2択と補助導線だけを持つ。
// /ws/lobby への接続は useLobbySocket（F-05 の残り）で入れるため、ここではまだ張らない。


const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
	connecting: { text: '接続中…', cls: 'text-fg-muted' },
	open: { text: '接続済み', cls: 'text-sky-300' },
	reconnecting: { text: '再接続中…', cls: 'text-amber-300' },
	closed: { text: '切断', cls: 'text-rose-400' },
};

export default function LobbyPage() {
	const { user } = useAuth();
	const { status, onlineCount, room, error, send } = useLobby();
	const navigate = useNavigate();

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
			<header className="flex flex-wrap items-baseline justify-between gap-2">
				<h1 className="text-heading-lg">ロビー</h1>
				<div className="flex items-baseline gap-3">
					<p className={`text-caption ${STATUS_LABEL[status]?.cls ?? ''}`}>
						● {STATUS_LABEL[status]?.text ?? status}
						{status === 'open' && `（ロビー ${onlineCount} 人）`}
					</p>
					{user && (
						<p className="text-caption text-fg-muted">
							{user.displayName} としてログイン中
						</p>
					)}
				</div>
			</header>

			<div className="grid gap-4 sm:grid-cols-2">
				<Card className="flex flex-col gap-3">
					<h2 className="text-heading-sm">部屋を作る</h2>
					<p className="text-body text-fg-muted">
						ゲームモードを選んで部屋を作ります。作ると 6 文字の部屋コードが
						発行されるので、それを友達に伝えて集まります。
					</p>
					{/* mt-auto: 説明文の長さが違っても2枚のボタン位置を揃える */}
					<div className="mt-auto pt-1">
						<Button fullWidth onClick={() => navigate('/lobby/create')}>
							部屋を作る
						</Button>
					</div>
				</Card>

				<Card className="flex flex-col gap-3">
					<h2 className="text-heading-sm">部屋に参加する</h2>
					<p className="text-body text-fg-muted">
						友達から聞いた 6 文字の部屋コードを入力して参加します。
						コードは試合が始まると使えなくなります。
					</p>
					<div className="mt-auto pt-1">
						<Button fullWidth onClick={() => navigate('/lobby/join')}>
							部屋に参加する
						</Button>
					</div>
				</Card>
			</div>

			<Card className="flex flex-wrap items-center justify-between gap-3">
				<div>
					<p className="text-label">その他</p>
					<p className="text-caption text-fg-muted">
						操作方法の確認や、音量の設定はこちらから
					</p>
				</div>
				<Button
				variant='secondary'
				fullWidth onClick={() => navigate('/lobby/how-to')}>
					操作マニュアル
				</Button>
			</Card>

			{room && (
				<Card className="flex flex-col gap-3">
					<div className="flex flex-wrap items-baseline justify-between gap-2">
						<h2 className="text-heading-sm">参加中の部屋</h2>
						<p className="text-caption text-fg-muted">
							モード {room.mode.toUpperCase()} ／ {room.state}
						</p>
					</div>
					<div>
						<p className="text-caption text-fg-muted">部屋コード（友達に伝えてください）</p>
						<p className="text-heading-lg tracking-[0.3em] text-sky-300">{room.code}</p>
					</div>
					<ul className="flex flex-col gap-1">
						{room.seats.map((seat) => (
							<li key={seat.slot} className="text-body">
								<span className="text-fg-muted">席 {seat.slot + 1}:</span>{' '}
								{seat.display_name ?? <span className="text-fg-muted">（空き）</span>}
								{seat.is_ai && <span className="text-caption text-fg-muted">（AI）</span>}
							</li>
						))}
					</ul>
					<div>
						<Button variant="ghost" onClick={() => send({ t: 'room_leave', d: {} })}>
							退室する
						</Button>
					</div>
				</Card>
			)}

			{error && (
				<p className="text-body text-rose-400" role="alert">
					{error.message}（{error.code}）
				</p>
			)}

		</div>
	);
}
