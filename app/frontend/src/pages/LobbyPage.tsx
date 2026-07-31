import { Link } from 'react-router-dom';

import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';

// F-05 の担当（ロビー一式 + useLobbySocket）。ここは stub。
// F-06 の GameView を試すために /game/dev-room への暫定リンクを残す

export default function LobbyPage() {
	return (
		<div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-8">
			<h1 className="text-xl font-semibold">ロビー</h1>
			<Card>
				<p className="text-sm text-slate-400">
					このページは F-05 で実装します（キュー / ルーム / フレンド / 試合フィード）。
				</p>
			</Card>
			<div className="flex gap-2">
				<Link to="/game/dev-room">
					<Button variant="secondary">/game/dev-room を開く (F-06 動作確認用)</Button>
				</Link>
			</div>
		</div>
	);
}
