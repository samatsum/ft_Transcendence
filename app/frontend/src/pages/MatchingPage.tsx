import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { listMapsResponseSchema } from '@ft/shared';

import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useLobby } from '../contexts/LobbyContext.js';

// F-05 の待機画面。部屋ができてから試合が始まるまでの間、ここに全員が滞在する。
// マップと先取点はサーバの設計上「部屋を作った後」に変えるものなので、この画面が持つ。

// 型名は shared 側で export されていないので、スキーマから起こす
type MapEntry = (typeof listMapsResponseSchema)['_output'][number];

const RSP_SCORES = [3, 5, 7, 10, 15, 21];

export default function MatchingPage() {
	const { room, matchFound, error, send, clearMatchFound } = useLobby();
	const { user } = useAuth();
	const navigate = useNavigate();
	const [maps, setMaps] = useState<MapEntry[]>([]);

	const isHost = room != null && user != null && room.host_id === user.id;
	const filled = room?.seats.filter((s) => s.user_id !== null || s.is_ai).length ?? 0;
	const total = room?.seats.length ?? 0;

	// 部屋から出た（退室・解散）ならロビーへ戻す
	useEffect(() => {
		if (!room) navigate('/lobby', { replace: true });
	}, [room, navigate]);

	// マッチが成立したら対戦画面へ。room_id はサーバが決める。
	// 遷移したら matchFound を捨てる。残したままだと、試合後にロビーへ戻った瞬間に
	// 古い値でまた対戦画面へ弾き返される（レビュー指摘 #157）
	useEffect(() => {
		if (!matchFound) return;
		const roomId = matchFound.room_id;
		clearMatchFound();
		navigate(`/game/${roomId}`, { replace: true });
	}, [matchFound, clearMatchFound, navigate]);

	// 選べるマップはモードごとに違うので、部屋のモードで問い合わせる
	useEffect(() => {
		if (!room) return;
		const controller = new AbortController();
		fetch(`/api/maps?mode=${room.mode}`, { credentials: 'include', signal: controller.signal })
			.then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
			.then((body: unknown) => {
				const parsed = listMapsResponseSchema.safeParse(body);
				if (parsed.success) setMaps(parsed.data);
			})
			.catch(() => undefined);
		return () => controller.abort();
	}, [room?.mode]);

	if (!room) return null;

	// ルール変更はホストだけが送れる（サーバも not_host で弾く）
	function updateRules(patch: { map?: string; target_score?: number }) {
		if (!room) return;
		const next =
			room.mode === 'rsp'
				? { map: patch.map ?? room.rules.map, target_score: patch.target_score ?? room.rules.target_score }
				: { map: patch.map ?? room.rules.map };
		send({ t: 'room_update_rules', d: next });
	}

	const starting = room.state === 'starting';

	return (
		<div className="mx-auto flex max-w-2xl flex-col gap-6 px-4 py-10">
			<header className="flex flex-col gap-1">
				<h1 className="text-heading-lg">対戦を待っています</h1>
				<p className="text-body text-fg-muted">
					{starting
						? 'まもなく始まります…'
						: `あと ${Math.max(0, total - filled)} 人で始められます（${filled} / ${total}）`}
				</p>
			</header>

			<Card className="flex flex-col gap-2">
				<p className="text-caption text-fg-muted">部屋コード（友達に伝えてください）</p>
				<p className="text-heading-lg tracking-[0.3em] text-sky-300">{room.code}</p>
				<p className="text-caption text-fg-muted">
					モード {room.mode.toUpperCase()}　／　試合が始まるとこのコードは使えなくなります
				</p>
			</Card>

			<Card className="flex flex-col gap-2">
				<h2 className="text-heading-sm">参加者</h2>
				<ul className="flex flex-col gap-1">
					{room.seats.map((seat) => (
						<li key={seat.slot} className="text-body flex items-baseline gap-2">
							<span className="text-fg-muted">席 {seat.slot + 1}</span>
							{seat.display_name ? (
								<span>{seat.display_name}</span>
							) : (
								<span className="text-fg-muted">（空き）</span>
							)}
							{seat.is_ai && <span className="text-caption text-fg-muted">AI</span>}
							{room.host_id === seat.user_id && (
								<span className="text-caption text-sky-300">ホスト</span>
							)}
						</li>
					))}
				</ul>
			</Card>

			<Card className="flex flex-col gap-4">
				<div className="flex items-baseline justify-between gap-2">
					<h2 className="text-heading-sm">試合の設定</h2>
					{!isHost && (
						<p className="text-caption text-fg-muted">ホストだけが変更できます</p>
					)}
				</div>

				<div className="flex flex-col gap-2">
					<p className="text-label">マップ</p>
					<div className="grid gap-2 sm:grid-cols-2">
						{maps.map((m) => {
							const selected = room.rules.map === m.id;
							return (
								<button
									key={m.id}
									type="button"
									disabled={!isHost || starting}
									onClick={() => updateRules({ map: m.id })}
									className={`rounded-lg border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
										selected
											? 'border-sky-500 bg-sky-500/10'
											: 'border-slate-700 bg-slate-800 enabled:hover:border-slate-600'
									}`}
								>
									<span className="text-label">{m.name}</span>
									<span className="text-caption text-fg-muted mt-1 block">{m.description}</span>
								</button>
							);
						})}
					</div>
				</div>

				{/* 先取点は RSP だけの概念。FPS は収集レースなので存在しない */}
				{room.mode === 'rsp' && (
					<div className="flex flex-col gap-2">
						<p className="text-label">先取点</p>
						<div className="flex flex-wrap gap-2">
							{RSP_SCORES.map((score) => (
								<Button
									key={score}
									variant={room.rules.target_score === score ? 'primary' : 'ghost'}
									disabled={!isHost || starting}
									onClick={() => updateRules({ target_score: score })}
								>
									{score}
								</Button>
							))}
						</div>
					</div>
				)}
			</Card>

			{error && (
				<p className="text-body text-rose-400" role="alert">
					{error.message}（{error.code}）
				</p>
			)}

			<div className="flex flex-wrap gap-3">
				{isHost && (
					<Button
						disabled={starting}
						onClick={() => send({ t: 'room_start', d: {} })}
						title="空いている席は AI が埋めます"
					>
						{starting ? '開始しています…' : '開始する（空席は AI）'}
					</Button>
				)}
				<Button
					variant="ghost"
					disabled={starting}
					onClick={() => send({ t: 'room_leave', d: {} })}
				>
					退室する
				</Button>
			</div>
		</div>
	);
}
