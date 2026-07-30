// W-10: ルームのレジストリ。room_id → GameRoom をモジュールスコープの Map で
// 同時複数保持する（② §6。マルチユーザー要件の根拠）。
//
// W-09（マッチメイキング）と W-11（ゲーム WS）は、GameRoom の内部を知らずに
// ここの createRoom / getRoom / closeRoom だけを使う。
import { defaultMapId, loadMapText, type GameMode } from './maps.js';
import { GameRoom, type RoomOptions, type RoomState } from './room.js';

/** created / countdown / finished の時間経過を進める間隔。tick ループとは別 */
const PUMP_INTERVAL_MS = 250;

const rooms = new Map<string, GameRoom>();
/** createRoom の await 中に同一 ID の重複作成を防ぐ、生成試行token付き予約 */
const reserved = new Map<string, string>();
let pumpTimer: NodeJS.Timeout | null = null;

export type CreateRoomOptions = Omit<RoomOptions, 'roomId'> & {
	roomId?: string;
	/** W-09のclaim token。abort後の遅延完了が新しい予約を消さないために使う */
	reservationToken?: string;
	signal?: AbortSignal;
};

/** ID予約、abort、遅延成功をtoken単位で保護しながらGameRoomを生成する */
export async function createRoom(options: CreateRoomOptions): Promise<GameRoom> {
	const roomId = options.roomId ?? nextRoomId();
	const reservationToken = options.reservationToken ?? nextReservationToken();
	if (rooms.has(roomId) || reserved.has(roomId)) {
		throw new Error(`room ${roomId} は既に存在する`);
	}
	if (options.signal?.aborted) throw abortError();
	reserved.set(roomId, reservationToken);
	const releaseOwnReservation = (): void => {
		if (reserved.get(roomId) === reservationToken) reserved.delete(roomId);
	};
	options.signal?.addEventListener('abort', releaseOwnReservation, { once: true });
	let room: GameRoom;
	try {
		const {
			signal: _signal,
			reservationToken: _reservationToken,
			...roomOptions
		} = options;
		room = await GameRoom.create({ ...roomOptions, roomId });
	} catch (e) {
		releaseOwnReservation();
		options.signal?.removeEventListener('abort', releaseOwnReservation);
		throw e;
	}
	options.signal?.removeEventListener('abort', releaseOwnReservation);
	if (options.signal?.aborted || reserved.get(roomId) !== reservationToken) {
		releaseOwnReservation();
		room.close('discarded');
		throw abortError();
	}
	releaseOwnReservation();
	rooms.set(roomId, room);
	ensurePump();
	return room;
}

/**
 * ② §4-B の `rules` からルームを作る（W-09 が使う入口）。
 *
 * **マップ ID → `.cub` テキストの解決はここで行う**（③ §2-E / ② §5-B）。
 * GameRoom 自体はテキストしか知らないので、W-14 の変更が room.ts に波及しない。
 */
export async function createRoomFromRules(options: {
	roomId?: string;
	mode: GameMode;
	rules?: { map?: string; target_score?: number };
	seed?: number;
	participants?: RoomOptions['participants'];
	humanSlots?: number[];
	onBroadcast?: RoomOptions['onBroadcast'];
	persistMatch?: RoomOptions['persistMatch'];
	onMatchResult?: RoomOptions['onMatchResult'];
	onLifecycle?: RoomOptions['onLifecycle'];
	now?: RoomOptions['now'];
	log?: RoomOptions['log'];
	reservationToken?: string;
	signal?: AbortSignal;
}): Promise<GameRoom> {
	const mapId = options.rules?.map ?? defaultMapId(options.mode);
	const { entry, text } = loadMapText(mapId);
	if (entry.mode !== options.mode) {
		throw new Error(`map ${mapId} は ${entry.mode} 用で、${options.mode} には使えない`);
	}
	return createRoom({
		roomId: options.roomId,
		cubText: text,
		mode: options.mode,
		// 範囲 3–21 の検証は W-08 の共有 lobby スキーマ側の責務（G-05 の決定）。
		// ここは 0 を渡せばエンジンが既定値へ落とす
		targetScore: options.rules?.target_score ?? 0,
		seed: options.seed ?? 0,
		participants: options.participants,
		humanSlots: options.humanSlots,
		onBroadcast: options.onBroadcast,
		persistMatch: options.persistMatch,
		onMatchResult: options.onMatchResult,
		onLifecycle: options.onLifecycle,
		now: options.now,
		log: options.log,
		reservationToken: options.reservationToken,
		signal: options.signal,
	});
}

export function getRoom(roomId: string): GameRoom | undefined {
	return rooms.get(roomId);
}

export function listRooms(): GameRoom[] {
	return [...rooms.values()];
}

export function roomCount(): number {
	return rooms.size;
}

/** W-09検査と監視向けに、生成中予約の件数を返す */
export function roomReservationCount(): number {
	return reserved.size;
}

export function closeRoom(roomId: string): void {
	const room = rooms.get(roomId);
	if (!room) return;
	room.close();
	rooms.delete(roomId);
	stopPumpIfIdle();
}

/** テストとシャットダウン用。全ルームを破棄してタイマーを止める */
export function closeAllRooms(): void {
	for (const room of rooms.values()) room.close();
	rooms.clear();
	reserved.clear();
	stopPumpIfIdle();
}

export function roomStates(): Record<string, RoomState> {
	const out: Record<string, RoomState> = {};
	for (const [id, room] of rooms) out[id] = room.getState();
	return out;
}

/**
 * created の join 待ち・countdown・finished の保持時間は tick ループの外なので、
 * ここでまとめて進める。closed になったルームは Map から落とす。
 */
function ensurePump(): void {
	if (pumpTimer) return;
	pumpTimer = setInterval(() => {
		for (const [id, room] of rooms) {
			room.pump();
			if (room.getState() === 'closed') rooms.delete(id);
		}
		stopPumpIfIdle();
	}, PUMP_INTERVAL_MS);
	// ルームが無いときにプロセスを延命させない
	pumpTimer.unref();
}

function stopPumpIfIdle(): void {
	if (rooms.size === 0 && pumpTimer) {
		clearInterval(pumpTimer);
		pumpTimer = null;
	}
}

let sequence = 0;
let reservationSequence = 0;

/** wireへ出さない内部room IDを生成する */
function nextRoomId(): string {
	sequence += 1;
	return `room-${sequence.toString(36)}-${Date.now().toString(36)}`;
}

/** claim token未指定の直接生成に使う内部予約tokenを生成する */
function nextReservationToken(): string {
	reservationSequence += 1;
	return `reservation-${reservationSequence.toString(36)}`;
}

/** AbortSignal由来と判別できる標準名のErrorを生成する */
function abortError(): Error {
	const error = new Error('room creation aborted');
	error.name = 'AbortError';
	return error;
}
