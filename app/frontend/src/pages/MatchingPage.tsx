import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useLobby } from '../contexts/LobbyContext.js';
import { GameCustomizationFields } from '../lobby/GameCustomizationFields.js';
import { useRoomRulesDraft } from '../lobby/useRoomRulesDraft.js';

// F-05 の待機画面。部屋ができてから試合が始まるまでの間、全員がここに滞在する。
// 設定フォームはロビーの「参加中の部屋」と同じ部品・同じ状態遷移を使う。

export default function MatchingPage() {
	const { status, room, error, send, clearRoom } = useLobby();
	const { user } = useAuth();
	const navigate = useNavigate();
	const rules = useRoomRulesDraft();

	const isHost = room != null && user != null && room.host_id === user.id;
	const filled = room?.seats.filter((s) => s.user_id !== null || s.is_ai).length ?? 0;
	const total = room?.seats.length ?? 0;

	// この画面を直接開いた（再読み込みした）直後は、まだ room_state が届いていない。
	// そこで「部屋が無い」と判断するとロビーへ弾いてしまうので、接続が開いてから
	// 少しだけ待つ。サーバは接続時に在室者へ room_state を送り直す（ws.ts の resendContext）
	const [settled, setSettled] = useState(false);
	useEffect(() => {
		if (status !== 'open') return;
		const timer = setTimeout(() => setSettled(true), 1000);
		return () => clearTimeout(timer);
	}, [status]);

	// 部屋から出た（退室・解散）ならロビーへ戻す
	useEffect(() => {
		if (!room && settled) navigate('/lobby', { replace: true });
	}, [room, settled, navigate]);

	// マッチ成立時の遷移は LobbyScope の MatchFoundRedirect が受け持つ。
	// ロビーに戻っている人も試合へ入れるようにするため、この画面には置かない

	if (!room) {
		return (
			<p className="text-body text-fg-muted px-4 py-10">
				{settled ? '部屋が見つかりません。ロビーへ戻ります…' : '部屋の情報を読み込んでいます…'}
			</p>
		);
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
					モード {room.mode.toUpperCase()} ／ 試合が始まるとこのコードは使えなくなります
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
					{!isHost && <p className="text-caption text-fg-muted">ホストだけが変更できます</p>}
				</div>
				<GameCustomizationFields
					mode={room.mode}
					maps={rules.maps}
					mapChoice={rules.mapChoice || room.rules.map}
					targetScore={rules.targetScore}
					onMapChange={rules.onMapChange}
					onTargetScoreChange={rules.onTargetScoreChange}
					disabled={rules.fieldsDisabled || starting}
					readOnly={rules.readOnly}
					mapHint={rules.mapHint}
					targetScoreError={
						rules.settingsError?.startsWith('先取点') ? rules.settingsError : null
					}
				/>
				{rules.canEditRules && (
					<div>
						<Button
							variant="secondary"
							disabled={rules.submitDisabled || starting}
							onClick={rules.updateRules}
						>
							{rules.updatingRules ? '更新中…' : 'ゲーム設定を更新する'}
						</Button>
					</div>
				)}
				{rules.settingsError && !rules.settingsError.startsWith('先取点') && (
					<p className="text-body text-rose-400" role="alert">
						{rules.settingsError}
					</p>
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
				{/* サーバは退室の成功時に何も返さない（失敗時だけ error）。
				    room_state も届かないので、送信できたら画面側で捨てる。
				    捨てないと room が残り続け、上の useEffect が動かずこの画面から出られない */}
				<Button
					variant="ghost"
					disabled={starting}
					onClick={() => {
						if (send({ t: 'room_leave', d: {} })) clearRoom();
					}}
				>
					退室する
				</Button>
			</div>
		</div>
	);
}
