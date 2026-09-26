import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import type { FpsAiSpeed, LobbyMode } from '@ft/shared';

import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { useLobby } from '../contexts/LobbyContext.js';
import { GameCustomizationFields } from '../lobby/GameCustomizationFields.js';
import {
	DEFAULT_MAP_CHOICE,
	DEFAULT_AI_SPEED,
	DEFAULT_TARGET_SCORE,
	buildRoomCreateMessage,
} from '../lobby/gameCustomization.js';
import { useGameMaps } from '../lobby/useGameMaps.js';

// F-05 の部屋作成画面。サーバの room_create は { mode, rules? } しか受け取らないため、
// #139 のマップ・先取点設定を同じメッセージへ含める

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

export const ROOM_CREATE_ERROR_TEXT: Record<string, string> = {
	queue_already_joined: 'マッチング待機中です。先に待機を終了してください。',
	already_in_room: 'すでに別の部屋に参加しています。',
	already_in_game: '試合の開始中または参加中は部屋を作成できません。',
	rate_limited: '部屋の作成回数が上限に達しました。しばらく待ってからお試しください。',
};

export default function RoomCreatePage() {
	const navigate = useNavigate();
	const { status, room, error, send, clearError } = useLobby();
	const [mode, setMode] = useState<LobbyMode>('rsp');
	const { maps, status: mapsStatus } = useGameMaps(mode);
	const [mapChoice, setMapChoice] = useState(DEFAULT_MAP_CHOICE);
	const [targetScore, setTargetScore] = useState(DEFAULT_TARGET_SCORE);
	const [aiSpeed, setAiSpeed] = useState<FpsAiSpeed>(DEFAULT_AI_SPEED);
	const [settingsError, setSettingsError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	// 遷移は送信の成否ではなく、サーバから room_state が届いた時点で行う。
	// WebSocket には「送信に対する返事」が無く、部屋ができたことは全員へ配られる
	// room_state で分かるため
	useEffect(() => {
		if (room) {
			setSubmitting(false);
			navigate('/lobby/matching', { replace: true });
		}
	}, [room, navigate]);

	// エラーが返ってきたら送信中の表示を解く（サーバは error メッセージで理由を返す）
	useEffect(() => {
		if (error) setSubmitting(false);
	}, [error]);

	function handleCreate() {
		const result = buildRoomCreateMessage({ mode, mapChoice, targetScore, aiSpeed, maps });
		if (!result.success) {
			setSettingsError(result.error);
			return;
		}
		setSettingsError(null);
		clearError();
		setSubmitting(true);
		if (!send(result.message)) setSubmitting(false);
	}

	function handleModeChange(nextMode: LobbyMode) {
		setMode(nextMode);
		setMapChoice(DEFAULT_MAP_CHOICE);
		setTargetScore(DEFAULT_TARGET_SCORE);
		setAiSpeed(DEFAULT_AI_SPEED);
		setSettingsError(null);
	}

	const mapsUnavailable = mapsStatus !== 'ready' || maps.length === 0;
	const mapHint =
		mapsStatus === 'loading'
			? 'マップ一覧を読み込んでいます。'
			: mapsStatus === 'error'
				? 'マップ一覧を取得できませんでした。'
				: maps.length === 0
					? 'このモードで利用できるマップがありません。'
					: '指定しない場合はサーバー既定、ランダムは作成時に1つ抽選します。';

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
									onChange={() => handleModeChange(m.value)}
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

			<GameCustomizationFields
				mode={mode}
				maps={maps}
				mapChoice={mapChoice}
				targetScore={targetScore}
				aiSpeed={aiSpeed}
				onMapChange={(choice) => {
					setMapChoice(choice);
					setSettingsError(null);
				}}
				onTargetScoreChange={(score) => {
					setTargetScore(score);
					setSettingsError(null);
				}}
				onAiSpeedChange={(speed) => {
					setAiSpeed(speed);
					setSettingsError(null);
				}}
				disabled={submitting || mapsUnavailable}
				allowDefault
				mapHint={mapHint}
				targetScoreError={settingsError?.startsWith('先取点') ? settingsError : null}
			/>

			<div className="flex flex-wrap gap-3">
				<Button
					onClick={handleCreate}
					disabled={submitting || status !== 'open' || mapsUnavailable}
				>
					{submitting ? '作成中…' : 'この設定で部屋を作る'}
				</Button>
				<Button variant="ghost" onClick={() => navigate('/lobby')}>
					戻る
				</Button>
			</div>

			{error && (
				<p className="text-body text-rose-400" role="alert">
					{ROOM_CREATE_ERROR_TEXT[error.code] ?? `部屋を作れませんでした（${error.message}）`}
				</p>
			)}
			{settingsError && !settingsError.startsWith('先取点') && (
				<p className="text-body text-rose-400" role="alert">
					{settingsError}
				</p>
			)}

			<Card>
				<p className="text-caption text-fg-muted">
					部屋を作った後も、ロビーでホストがゲーム設定を変更できます。
				</p>
			</Card>
		</div>
	);
}
