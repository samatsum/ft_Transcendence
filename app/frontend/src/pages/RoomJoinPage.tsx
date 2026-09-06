import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';

import { roomCodeSchema } from '@ft/shared';

import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { FormField } from '../components/FormField.js';
import { Input } from '../components/Input.js';
import { useLobby } from '../contexts/LobbyContext.js';

// F-05 の部屋参加画面。サーバの room_join は { code } しか受け取らない（パスワードは無い）。
// 検証はバックエンドと同じ roomCodeSchema を使うので、判定がずれることがない。

// 部屋コードで拒否されうるサーバ側の理由。ユーザー向けの文言に変換する
export const JOIN_ERROR_TEXT: Record<string, string> = {
	room_not_found: 'その部屋コードは見つかりませんでした。入力を確認してください。',
	room_full: 'その部屋は満員です。',
	room_starting: 'その部屋はすでに試合が始まっています。',
};

export default function RoomJoinPage() {
	const navigate = useNavigate();
	const { status, room, error: lobbyError, send } = useLobby();
	const [code, setCode] = useState('');
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	// 入室できたかは、サーバが全員へ配る room_state が届いたかで判断する
	useEffect(() => {
		if (room) navigate('/lobby', { replace: true });
	}, [room, navigate]);

	// サーバが返した拒否理由を、この画面の文言へ変換して出す
	useEffect(() => {
		if (!lobbyError) return;
		setSubmitting(false);
		setError(JOIN_ERROR_TEXT[lobbyError.code] ?? lobbyError.message);
	}, [lobbyError]);

	function handleSubmit(event: FormEvent) {
		event.preventDefault();
		const parsed = roomCodeSchema.safeParse(code);
		if (!parsed.success) {
			setError('部屋コードは 6 文字です。数字の 0・1 と英字の I・O は使いません。');
			return;
		}
		setError(null);
		setSubmitting(true);
		if (!send({ t: 'room_join', d: { code: parsed.data } })) {
			setSubmitting(false);
			setError('ロビーに接続していません。少し待ってからもう一度お試しください。');
		}
	}

	return (
		<div className="mx-auto flex max-w-lg flex-col gap-6 px-4 py-10">
			<header className="flex flex-col gap-1">
				<h1 className="text-heading-lg">部屋に参加する</h1>
				<p className="text-body text-fg-muted">
					友達から聞いた 6 文字の部屋コードを入力してください。
				</p>
			</header>

			<form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
				<FormField
					label="部屋コード"
					required
					error={error}
					hint="例: K7M2QP（小文字で入力しても大文字に直ります）"
				>
					<Input
						value={code}
						onChange={(e) => {
							// ここで toUpperCase しない。値が変わると React が input.value を
							// 書き戻し、そのたびにカーソルが末尾へ飛ぶため。
							// 表示は CSS の uppercase、正規化は送信時の roomCodeSchema が行う
							setCode(e.target.value);
							if (error) setError(null);
						}}
						maxLength={6}
						autoFocus
						autoComplete="off"
						spellCheck={false}
						placeholder="K7M2QP"
						className="text-heading-sm tracking-[0.4em] uppercase"
					/>
				</FormField>

				<div className="flex flex-wrap gap-3">
					<Button
						type="submit"
						disabled={submitting || code.length === 0 || status !== 'open'}
					>
						{submitting ? '参加中…' : '参加する'}
					</Button>
					<Button variant="ghost" onClick={() => navigate('/lobby')}>
						戻る
					</Button>
				</div>
			</form>

			<Card>
				<p className="text-caption text-fg-muted">
					部屋コードは試合が始まると使えなくなります。参加できないときは、
					ホストにまだ始まっていないか確認してください。
				</p>
			</Card>
		</div>
	);
}
