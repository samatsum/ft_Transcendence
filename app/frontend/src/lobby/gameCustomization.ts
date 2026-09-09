import {
	lobbyRoomCreateMessageSchema,
	lobbyRoomUpdateRulesSchema,
	type LobbyClientMessage,
	type LobbyMode,
	type RoomStatePayload,
} from '@ft/shared';

export const DEFAULT_MAP_CHOICE = '';
export const RANDOM_MAP_CHOICE = '__random__';
export const DEFAULT_TARGET_SCORE = '10';

export interface GameMapOption {
	id: string;
	name: string;
	mode: LobbyMode;
	description: string;
}

export interface GameCustomizationDraft {
	mode: LobbyMode;
	mapChoice: string;
	targetScore: string;
	maps: GameMapOption[];
}

type RoomCreateMessage = Extract<LobbyClientMessage, { t: 'room_create' }>;
type RoomUpdateRulesMessage = Extract<LobbyClientMessage, { t: 'room_update_rules' }>;

export type MessageBuildResult<T extends LobbyClientMessage> =
	| { success: true; message: T }
	| { success: false; error: string };

type RandomSource = () => number;

/** 現在の利用者が待機中ルームの設定を編集できるか判定する */
export function canEditRoomRules(
	room: RoomStatePayload | null,
	userId: number | null | undefined,
): boolean {
	return Boolean(room && userId && room.host_id === userId && room.state === 'open');
}

/** 選択値をwireへ送る具体的なmap IDへ解決する */
function resolveMapChoice(
	draft: GameCustomizationDraft,
	allowDefault: boolean,
	random: RandomSource,
): { success: true; map?: string } | { success: false; error: string } {
	if (draft.mapChoice === DEFAULT_MAP_CHOICE) {
		return allowDefault
			? { success: true }
			: { success: false, error: 'マップを選択してください。' };
	}
	const modeMaps = draft.maps.filter((map) => map.mode === draft.mode);
	if (draft.mapChoice === RANDOM_MAP_CHOICE) {
		if (modeMaps.length === 0) {
			return { success: false, error: '選択できるマップがありません。' };
		}
		const value = random();
		if (!Number.isFinite(value) || value < 0 || value >= 1) {
			return { success: false, error: 'マップの抽選に失敗しました。' };
		}
		const selected = modeMaps[Math.floor(value * modeMaps.length)];
		return selected
			? { success: true, map: selected.id }
			: { success: false, error: 'マップの抽選に失敗しました。' };
	}
	if (!modeMaps.some((map) => map.id === draft.mapChoice)) {
		return { success: false, error: '選択したマップはこのモードでは使用できません。' };
	}
	return { success: true, map: draft.mapChoice };
}

/** RSPの入力値を製品仕様の3〜21の整数へ変換する */
function parseTargetScore(raw: string): number | null {
	const trimmed = raw.trim();
	if (!/^\d+$/.test(trimmed)) return null;
	const value = Number(trimmed);
	return Number.isInteger(value) && value >= 3 && value <= 21 ? value : null;
}

/** 部屋作成フォームを共有WS契約のroom_createへ変換する */
export function buildRoomCreateMessage(
	draft: GameCustomizationDraft,
	random: RandomSource = Math.random,
): MessageBuildResult<RoomCreateMessage> {
	const resolved = resolveMapChoice(draft, true, random);
	if (!resolved.success) return resolved;
	let candidate: unknown;
	if (draft.mode === 'rsp') {
		const targetScore = parseTargetScore(draft.targetScore);
		if (targetScore === null) {
			return { success: false, error: '先取点は3〜21の整数で入力してください。' };
		}
		candidate = {
			t: 'room_create',
			d: {
				mode: 'rsp',
				rules: {
					...(resolved.map ? { map: resolved.map } : {}),
					target_score: targetScore,
				},
			},
		};
	} else {
		candidate = {
			t: 'room_create',
			d: {
				mode: 'fps',
				...(resolved.map ? { rules: { map: resolved.map } } : {}),
			},
		};
	}
	const parsed = lobbyRoomCreateMessageSchema.safeParse(candidate);
	return parsed.success
		? { success: true, message: parsed.data }
		: { success: false, error: 'ゲーム設定が正しくありません。' };
}

/** 待機中の設定フォームを完全なcanonical rules更新へ変換する */
export function buildRoomUpdateRulesMessage(
	draft: GameCustomizationDraft,
	random: RandomSource = Math.random,
): MessageBuildResult<RoomUpdateRulesMessage> {
	const resolved = resolveMapChoice(draft, false, random);
	if (!resolved.success) return resolved;
	let candidate: unknown;
	if (draft.mode === 'rsp') {
		const targetScore = parseTargetScore(draft.targetScore);
		if (targetScore === null) {
			return { success: false, error: '先取点は3〜21の整数で入力してください。' };
		}
		candidate = {
			t: 'room_update_rules',
			d: { map: resolved.map, target_score: targetScore },
		};
	} else {
		candidate = { t: 'room_update_rules', d: { map: resolved.map } };
	}
	const parsed = lobbyRoomUpdateRulesSchema.safeParse(candidate);
	return parsed.success
		? { success: true, message: parsed.data }
		: { success: false, error: 'ゲーム設定が正しくありません。' };
}
