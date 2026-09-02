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

			{import.meta.env.DEV && (
				<Card className="flex flex-col gap-3">
					<p className="text-label">ロビーWS 動作確認（開発時のみ）</p>
					<div className="flex flex-wrap gap-2">
						<Button
							variant="secondary"
							onClick={() => send({ t: 'room_create', d: { mode: 'rsp' } })}
							disabled={status !== 'open'}
						>
							RSP の部屋を作る
						</Button>
						<Button
							variant="ghost"
							onClick={() => send({ t: 'room_leave', d: {} })}
							disabled={status !== 'open' || !room}
						>
							退室する
						</Button>
					</div>
					{room && (
						<pre className="overflow-x-auto rounded bg-slate-900 p-3 text-caption text-slate-200">
{`部屋コード : ${room.code}
モード     : ${room.mode}
状態       : ${room.state}
席         : ${room.seats.map((s) => s.display_name ?? '（空）').join(' / ')}`}
						</pre>
					)}
					{error && (
						<p className="text-caption text-rose-400">
							{error.code}: {error.message}
						</p>
					)}
				</Card>
			)}
		</div>
	);
}
