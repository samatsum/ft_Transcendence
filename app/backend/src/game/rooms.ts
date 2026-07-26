// W-10: ルームのレジストリ。room_id → GameRoom をモジュールスコープの Map で
// 同時複数保持する（② §6。マルチユーザー要件の根拠）。
//
// W-09（マッチメイキング）と W-11（ゲーム WS）は、GameRoom の内部を知らずに
// ここの createRoom / getRoom / closeRoom だけを使う。
import { GameRoom, type RoomOptions, type RoomState } from './room.js';

/** created / countdown / finished の時間経過を進める間隔。tick ループとは別 */
const PUMP_INTERVAL_MS = 250;

const rooms = new Map<string, GameRoom>();
let pumpTimer: NodeJS.Timeout | null = null;

export type CreateRoomOptions = Omit<RoomOptions, 'roomId'> & { roomId?: string };

export async function createRoom(options: CreateRoomOptions): Promise<GameRoom> {
	const roomId = options.roomId ?? nextRoomId();
	if (rooms.has(roomId)) {
		throw new Error(`room ${roomId} は既に存在する`);
	}
	const room = await GameRoom.create({ ...options, roomId });
	rooms.set(roomId, room);
	ensurePump();
	return room;
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

function nextRoomId(): string {
	sequence += 1;
	return `room-${sequence.toString(36)}-${Date.now().toString(36)}`;
}
