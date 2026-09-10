import { useEffect, useRef, useState } from 'react';

import type { FpsAiSpeed } from '@ft/shared';

import { useAuth } from '../contexts/AuthContext.js';
import { useLobby } from '../contexts/LobbyContext.js';
import {
	DEFAULT_AI_SPEED,
	DEFAULT_TARGET_SCORE,
	buildRoomUpdateRulesMessage,
	canEditRoomRules,
	type GameMapOption,
} from './gameCustomization.js';
import { useGameMaps } from './useGameMaps.js';

// 参加中ルームのゲーム設定フォームの下ごしらえ。ロビーの「参加中の部屋」と
// 待機画面（#111）が同じ状態遷移を持つため、両方から使えるようここへ寄せる。
//
// 難しいのは「編集中の入力」と「サーバから届く room_state」がぶつかる点。
// 送信前に他人の更新が届いたら入力を上書きするが、自分が触っている最中は上書きしない。

export interface RoomRulesDraft {
	mapChoice: string;
	targetScore: string;
	settingsError: string | null;
	aiSpeed: FpsAiSpeed;
	updatingRules: boolean;
	canEditRules: boolean;
	maps: GameMapOption[];
	mapHint: string | undefined;
	/** 入力欄を触らせてよいか（未接続・マップ取得失敗・更新中は触らせない） */
	fieldsDisabled: boolean;
	/** 「更新する」を押させてよいか（上に加えて、変更が無ければ押させない） */
	submitDisabled: boolean;
	/** ホスト以外・マップ未取得のときは入力欄ではなく読み取り表示にする */
	readOnly: boolean;
	onMapChange: (choice: string) => void;
	onTargetScoreChange: (score: string) => void;
	updateRules: () => void;
	onAiSpeedChange: (speed: FpsAiSpeed) => void;
}

export function useRoomRulesDraft(): RoomRulesDraft {
	const { user } = useAuth();
	const { status, room, error, send, clearError } = useLobby();
	const { maps, status: mapsStatus } = useGameMaps(room?.mode ?? null);
	const [mapChoice, setMapChoice] = useState('');
	const [targetScore, setTargetScore] = useState(DEFAULT_TARGET_SCORE);
	const [aiSpeed, setAiSpeed] = useState<FpsAiSpeed>(DEFAULT_AI_SPEED);
	const [settingsError, setSettingsError] = useState<string | null>(null);
	const [settingsDirty, setSettingsDirty] = useState(false);
	const [updatingRules, setUpdatingRules] = useState(false);
	const pendingRoomRef = useRef<typeof room>(null);

	useEffect(() => {
		if (!room) {
			setSettingsDirty(false);
			setUpdatingRules(false);
			pendingRoomRef.current = null;
			return;
		}
		const receivedUpdate = pendingRoomRef.current && room !== pendingRoomRef.current;
		if (!settingsDirty || receivedUpdate) {
			setMapChoice(room.rules.map);
			setTargetScore(
				room.mode === 'rsp' ? String(room.rules.target_score) : DEFAULT_TARGET_SCORE,
			);
			setAiSpeed(room.mode === 'fps' ? room.rules.ai_speed : DEFAULT_AI_SPEED);
			setSettingsError(null);
			setSettingsDirty(false);
		}
		if (receivedUpdate) {
			setUpdatingRules(false);
			pendingRoomRef.current = null;
		}
	}, [room, settingsDirty]);

	useEffect(() => {
		if (!error || !pendingRoomRef.current) return;
		if (room) {
			setMapChoice(room.rules.map);
			setTargetScore(
				room.mode === 'rsp' ? String(room.rules.target_score) : DEFAULT_TARGET_SCORE,
			);
			setAiSpeed(room.mode === 'fps' ? room.rules.ai_speed : DEFAULT_AI_SPEED);
			setSettingsDirty(false);
		}
		setUpdatingRules(false);
		pendingRoomRef.current = null;
	}, [error, room]);

	const isHost = Boolean(room && user && room.host_id === user.id);
	const canEditRules = canEditRoomRules(room, user?.id);
	const mapsUnavailable = mapsStatus !== 'ready' || maps.length === 0;
	const mapHint =
		mapsStatus === 'loading'
			? 'マップ一覧を読み込んでいます。'
			: mapsStatus === 'error'
				? 'マップ一覧を取得できませんでした。'
				: maps.length === 0
					? 'このモードで利用できるマップがありません。'
					: isHost
						? 'ランダムは更新時に1つ抽選します。'
						: undefined;

	function updateRules() {
		if (!room || !canEditRules) return;
		const result = buildRoomUpdateRulesMessage({
			mode: room.mode,
			mapChoice,
			targetScore,
			aiSpeed,
			maps,
		});
		if (!result.success) {
			setSettingsError(result.error);
			return;
		}
		setSettingsError(null);
		clearError();
		setUpdatingRules(true);
		pendingRoomRef.current = room;
		if (!send(result.message)) {
			setUpdatingRules(false);
			pendingRoomRef.current = null;
			setSettingsError('ロビーへ接続されていません。');
		}
	}

	const blocked = updatingRules || status !== 'open' || mapsUnavailable;

	return {
		mapChoice,
		targetScore,
		settingsError,
		aiSpeed,
		updatingRules,
		canEditRules,
		maps,
		mapHint,
		fieldsDisabled: blocked,
		submitDisabled: !settingsDirty || blocked,
		readOnly: !canEditRules || mapsUnavailable,
		onMapChange: (choice) => {
			setMapChoice(choice);
			setSettingsDirty(true);
			setSettingsError(null);
		},
		onTargetScoreChange: (score) => {
			setTargetScore(score);
			setSettingsDirty(true);
			setSettingsError(null);
		},
		onAiSpeedChange: (speed) => {
			setAiSpeed(speed);
			setSettingsDirty(true);
			setSettingsError(null);
		},
		updateRules,
	};
}
