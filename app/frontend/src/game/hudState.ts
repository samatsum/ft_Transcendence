import type { GameEvent, PlayerStatusMessage, SnapshotPayload } from '@ft/shared';

// HUD 派生 state のリデューサ(pure)。vitest から直接検査するため React 非依存。
// useHudState.ts が Event/setInterval で駆動して React state に反映する

export type SeatState = PlayerStatusMessage['d']['state']; // 'connected' | 'ai' | 'grace'

export interface SeatInfo {
	slot: number;
	name: string;
	state: SeatState;
	/** grace のときの猶予満了時刻(ms, performance.now 基準)。それ以外は null */
	graceDeadlineMs: number | null;
}

export interface MatchEndState {
	winner: number | null;
	reason: 'score' | 'goal' | 'forfeit' | 'abandon';
	matchId: number | null;
	/** snapshot 最終値(名前解決や勝敗表示に使う) */
	finalScore: [number, number];
}

export interface FlashState {
	/** 満了時刻(performance.now 基準) */
	expiresAtMs: number;
}

export interface PointFlashState extends FlashState {
	/** 0=赤, 1=青 */
	team: number;
}

export interface HandFlashState extends FlashState {
	/** 0/1/2 */
	hand: number;
}

export interface HudState {
	/** slot → 席情報 */
	seats: Map<number, SeatInfo>;
	/** null なら非表示 */
	countdownSeconds: number | null;
	/** match_start を受けたら true → countdown を強制消去 */
	matchStarted: boolean;
	matchEnd: MatchEndState | null;
	pointFlash: PointFlashState | null;
	handFlash: HandFlashState | null;
	/** 直近のスコア(スコアバー表示用。snapshot からもらう) */
	score: [number, number];
}

export function createInitialHudState(): HudState {
	return {
		seats: new Map(),
		countdownSeconds: null,
		matchStarted: false,
		matchEnd: null,
		pointFlash: null,
		handFlash: null,
		score: [0, 0],
	};
}

const POINT_FLASH_MS = 500;
const HAND_FLASH_MS = 300;

/**
 * snapshot の combatants から seats を導出(初期状態 / player_status で上書きされる前)。
 * `is_ai=true` → 'ai'、false → 'connected' が原則(② §5-B の初期挙動)。
 * `name` は placeholder(実名対応は shared/ws/game.ts の welcome 拡張の別 PR)
 */
export function seatsFromSnapshot(combatants: SnapshotPayload['combatants']): Map<number, SeatInfo> {
	const seats = new Map<number, SeatInfo>();
	// snapshot の combatants は slot と id が別概念だが、B-10 実装では
	// combatant_id = slot(0..3)。sim の内部リスト順は関係なく id で照合する(GV-06 参照)
	combatants.forEach((c) => {
		seats.set(c.id, {
			slot: c.id,
			name: c.is_ai ? 'AI' : `Player ${c.id}`,
			state: c.is_ai ? 'ai' : 'connected',
			graceDeadlineMs: null,
		});
	});
	return seats;
}

/**
 * player_status メッセージで seats を上書き。grace のときは deadline を刻む。
 * combatant name はここでは変えない(実名は welcome から来る想定)
 */
export function applyPlayerStatus(
	state: HudState,
	msg: PlayerStatusMessage['d'],
	/** grace_ms のカウントダウンを刻む起点時刻。event 到着時の performance.now */
	nowMs: number,
	/** ② §5-D player_disconnected の grace_ms(基本 30000) */
	graceMs = 30000,
): HudState {
	const seats = new Map(state.seats);
	const prev = seats.get(msg.slot) ?? {
		slot: msg.slot,
		name: `Player ${msg.slot}`,
		state: 'connected' as SeatState,
		graceDeadlineMs: null,
	};
	seats.set(msg.slot, {
		...prev,
		state: msg.state,
		graceDeadlineMs: msg.state === 'grace' ? nowMs + graceMs : null,
	});
	return { ...state, seats };
}

/** イベントを受けて HUD state を更新(pure)。時刻は performance.now を注入 */
export function applyGameEvent(state: HudState, event: GameEvent['d'], nowMs: number): HudState {
	switch (event.kind) {
		case 'countdown':
			return { ...state, countdownSeconds: event.seconds, matchStarted: false };
		case 'match_start':
			return { ...state, countdownSeconds: null, matchStarted: true };
		case 'point_scored':
			return {
				...state,
				score: event.score,
				pointFlash: { team: event.team, expiresAtMs: nowMs + POINT_FLASH_MS },
			};
		case 'hand_changed':
			// hand_changed は複数席で起きるが、フラッシュ対象は自席のみ。
			// 「自席かどうか」は呼び出し側(useHudState)で判定してから hand を渡す
			return {
				...state,
				handFlash: { hand: event.hand, expiresAtMs: nowMs + HAND_FLASH_MS },
			};
		case 'goal':
			// 追加演出は入れない(スコア/勝敗で見せる)。要件が無い
			return state;
		case 'match_end':
			return {
				...state,
				matchEnd: {
					winner: event.winner,
					reason: event.reason,
					matchId: event.match_id,
					finalScore: state.score,
				},
			};
		case 'player_disconnected':
			return applyPlayerStatus(
				state,
				{ slot: event.slot, state: 'grace' },
				nowMs,
				event.grace_ms,
			);
		case 'player_reconnected':
			return applyPlayerStatus(state, { slot: event.slot, state: 'connected' }, nowMs);
		case 'ai_takeover':
			return applyPlayerStatus(state, { slot: event.slot, state: 'ai' }, nowMs);
		default: {
			// discriminated union の網羅チェック
			const _exhaustive: never = event;
			void _exhaustive;
			return state;
		}
	}
}

/** 期限切れの flash を消す(rAF/setInterval から呼ぶ) */
export function expireFlashes(state: HudState, nowMs: number): HudState {
	let changed = false;
	let pointFlash = state.pointFlash;
	let handFlash = state.handFlash;
	if (pointFlash && pointFlash.expiresAtMs <= nowMs) {
		pointFlash = null;
		changed = true;
	}
	if (handFlash && handFlash.expiresAtMs <= nowMs) {
		handFlash = null;
		changed = true;
	}
	return changed ? { ...state, pointFlash, handFlash } : state;
}
