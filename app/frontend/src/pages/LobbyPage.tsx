import { useNavigate } from 'react-router-dom';

import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { useAuth } from '../contexts/AuthContext.js';

// F-05 ロビーの入口となるハブ画面。「部屋を作る」「部屋に参加する」の2択と補助導線だけを持つ。
// /ws/lobby への接続は useLobbySocket（F-05 の残り）で入れるため、ここではまだ張らない。

export default function LobbyPage() {
	const { user } = useAuth();
	const navigate = useNavigate();

	return (
		<div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10">
			<header className="flex flex-wrap items-baseline justify-between gap-2">
				<h1 className="text-heading-lg">ロビー</h1>
				{user && (
					<p className="text-caption text-fg-muted">
						{user.displayName} としてログイン中
					</p>
				)}
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
		</div>
	);
}
