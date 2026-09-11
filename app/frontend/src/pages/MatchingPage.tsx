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

	// 「部屋にいない」を示すメッセージはプロトコルに無い（lobby_hello の self.status は
	// 部屋で待機中も online）。時間で打ち切ると、再送が遅れただけの在室者を締め出すため、
	// room が無いときは自動遷移せず、下の案内から手で戻ってもらう。
	//
	// **「room が消えたらロビーへ戻す」useEffect は置かないこと（#190）。** room が消えるのは
	// 退室ボタンと match_found（サーバが部屋を削除した合図）の2通りで、後者のときに
	// ロビーへ戻すと、同じコミットで走る MatchFoundRedirect の /game 遷移を上書きする
	// （兄弟の後ろにあるこの画面の effect が後に実行されるため）。退室時の遷移はボタンで行う

	// マッチ成立時の遷移は LobbyScope の MatchFoundRedirect が受け持つ。
	// ロビーに戻っている人も試合へ入れるようにするため、この画面には置かない

	if (!room) {
		return (
			<div className="mx-auto flex max-w-2xl flex-col items-start gap-4 px-4 py-10">
				<p className="text-body text-fg-muted">部屋の情報を読み込んでいます…</p>
				<Button variant="ghost" onClick={() => navigate('/lobby', { replace: true })}>
					ロビーへ戻る
				</Button>
			</div>
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
					aiSpeed={rules.aiSpeed}
					onMapChange={rules.onMapChange}
					onTargetScoreChange={rules.onTargetScoreChange}
					onAiSpeedChange={rules.onAiSpeedChange}
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
						disabled={starting || status !== 'open'}
						onClick={() => send({ t: 'room_start', d: {} })}
						title="空いている席は AI が埋めます"
					>
						{starting ? '開始しています…' : '開始する（空席は AI）'}
					</Button>
				)}
				{/* サーバは退室の成功時に何も返さない（失敗時だけ error）。
				    room_state も届かないので、送信できたら画面側で捨ててロビーへ戻る。
				    遷移を useEffect に任せない理由は上のコメント（#190） */}
				<Button
					variant="ghost"
					disabled={starting || status !== 'open'}
					onClick={() => {
						if (!send({ t: 'room_leave', d: {} })) return;
						clearRoom();
						navigate('/lobby', { replace: true });
					}}
				>
					退室する
				</Button>
			</div>
		</div>
	);
}
