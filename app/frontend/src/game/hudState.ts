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
	/** FPS で死亡中なら復帰までの残り秒(切り上げ)。生存中・RSP は null(#245) */
	respawnSeconds: number | null;
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
export function seatsFromSnapshot(
	combatants: SnapshotPayload['combatants'],
	mode: SnapshotPayload['match']['mode'],
): Map<number, SeatInfo> {
	const seats = new Map<number, SeatInfo>();
	const seatCount = mode === 'fps' ? 2 : 4;
	// combatant id は席番号と一致する。FPS のマップ由来ハザード(id>=8)や範囲外 id は席にしない
	combatants.forEach((c) => {
		if (!Number.isInteger(c.id) || c.id < 0 || c.id >= seatCount) return;
		seats.set(c.id, {
			slot: c.id,
			name: c.is_ai ? 'AI' : `Player ${c.id}`,
			state: c.is_ai ? 'ai' : 'connected',
			graceDeadlineMs: null,
			respawnSeconds: null,
		});
	});
	return seats;
}

/**
 * snapshot の死亡状態(respawn_ms)を seats へ反映する(#245)。
 * sim は FPS の死亡中に respawn_ms>0 を出し、RSP では常に 0 なので、
 * respawn_ms>0 だけで死亡中とみなせる。表示は秒単位なので、秒が変わらない限り
 * 同じ Map を返して再描画を起こさない。seats に無い id(ハザード等)は無視する
 */
export function applySnapshotDeaths(
	seats: Map<number, SeatInfo>,
	combatants: SnapshotPayload['combatants'],
): Map<number, SeatInfo> {
	let next: Map<number, SeatInfo> | null = null;
	for (const c of combatants) {
		const seat = seats.get(c.id);
		if (!seat) continue;
		const respawnSeconds = c.respawn_ms > 0 ? Math.ceil(c.respawn_ms / 1000) : null;
		if (seat.respawnSeconds === respawnSeconds) continue;
		next ??= new Map(seats);
		next.set(c.id, { ...seat, respawnSeconds });
	}
	return next ?? seats;
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
		respawnSeconds: null,
	};
	seats.set(msg.slot, {
		...prev,
		state: msg.state,
		graceDeadlineMs: msg.state === 'grace' ? nowMs + graceMs : null,
	});
	return { ...state, seats };
}

/** イベントを受けて HUD state を更新(pure)、時刻と決着時の正本スコアは呼び出し側から注入 */
export function applyGameEvent(
	state: HudState,
	event: GameEvent['d'],
	nowMs: number,
	finalSnapshotScore?: readonly [number, number],
): HudState {
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
					finalScore: finalSnapshotScore
						? [finalSnapshotScore[0], finalSnapshotScore[1]]
						: state.score,
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
