import { useNavigate } from 'react-router-dom';

import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';

// 部屋作成画面。中身は別 Issue で実装するため、ここではハブからの遷移先の枠だけを置く。

export default function RoomCreatePage() {
	const navigate = useNavigate();
	return (
		<div className="mx-auto flex max-w-lg flex-col gap-4 px-4 py-10">
			<h1 className="text-heading-lg">部屋を作る</h1>
			<Card>
				<p className="text-body text-fg-muted">
					この画面はゲームモード（RSP / FPS）を選んで
					<code className="mx-1">room_create</code>
					を送るだけの、フォーム1枚の画面になります。
				</p>
			</Card>
			<div>
				<Button variant="ghost" onClick={() => navigate('/lobby')}>
					戻る
				</Button>
			</div>
		</div>
	);
}
