import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { LobbyMode } from '@ft/shared';

import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { useToast } from '../contexts/ToastContext.js';

// F-05 の部屋作成画面。サーバの room_create は { mode, rules? } しか受け取らないため、
// この画面で選ぶのはゲームモードだけ。マップと先取点は部屋を作ったあとに
// room_update_rules で変更する設計なので、待機画面（F-05 の残り）側に置く。

const MODES: { value: LobbyMode; title: string; players: string; summary: string }[] = [
	{
		value: 'rsp',
		title: 'RSP',
		players: '2 vs 2 ／ 4人',
		summary:
			'じゃんけん鬼ごっこ。相手チームに体当たりすると、その場でじゃんけんが起きます。勝てば1点、負ければ自分がリスポーン。先に規定点を取ったチームの勝ちです。',
	},
	{
		value: 'fps',
		title: 'FPS',
		players: '1 vs 1 ／ 2人',
		summary:
			'収集レース。マップ上の星を全部集めると扉が開き、その先のゴールに先に触れた方が勝ちです。巡回している敵に触れると数秒のあいだ復帰待ちになります。',
	},
];

export default function RoomCreatePage() {
	const navigate = useNavigate();
	const { push } = useToast();
	const [mode, setMode] = useState<LobbyMode>('rsp');
	const [submitting, setSubmitting] = useState(false);

	// TODO(F-05): useLobbySocket 実装後に room_create { mode } の送信へ差し替える。
	// 送信の成否ではなく、サーバから room_state が届いた時点で待機画面へ遷移させる
	function handleCreate() {
		setSubmitting(true);
		push({
			kind: 'info',
			message: `room_create { mode: "${mode}" } を送信します（ロビー接続は F-05 の残りで実装）`,
		});
		setSubmitting(false);
	}

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
			<header className="flex flex-col gap-1">
				<h1 className="text-heading-lg">部屋を作る</h1>
				<p className="text-body text-fg-muted">
					遊ぶゲームを選んでください。部屋を作ると 6 文字の部屋コードが発行されるので、
					それを友達に伝えると参加してもらえます。
				</p>
			</header>

			<fieldset className="flex flex-col gap-3">
				<legend className="text-label mb-2">ゲームモード</legend>
				<div className="grid gap-3 sm:grid-cols-2">
					{MODES.map((m) => {
						const selected = mode === m.value;
						return (
							<label
								key={m.value}
								className={`cursor-pointer rounded-lg border p-4 transition-colors ${
									selected
										? 'border-sky-500 bg-sky-500/10'
										: 'border-slate-700 bg-slate-800 hover:border-slate-600'
								}`}
							>
								<input
									type="radio"
									name="mode"
									value={m.value}
									checked={selected}
									onChange={() => setMode(m.value)}
									className="sr-only"
								/>
								<div className="flex items-baseline justify-between gap-2">
									<span className="text-heading-sm">{m.title}</span>
									<span className="text-caption text-fg-muted">{m.players}</span>
								</div>
								<p className="text-body mt-2 text-fg-muted">{m.summary}</p>
							</label>
						);
					})}
				</div>
			</fieldset>

			<div className="flex flex-wrap gap-3">
				<Button onClick={handleCreate} disabled={submitting}>
					この設定で部屋を作る
				</Button>
				<Button variant="ghost" onClick={() => navigate('/lobby')}>
					戻る
				</Button>
			</div>

			<Card>
				<p className="text-caption text-fg-muted">
					マップと先取点は、部屋を作ったあとの待機画面でホストが変更できます。
				</p>
			</Card>
		</div>
	);
}
