// W-11: ゲーム WS（`/ws/game/:roomId`）。② §5 の実装。
//
// **この層だけが WebSocket を知っている。** GameRoom（W-10）は通信を知らず、
// 配信は `room.subscribe()` 経由で受け取ってここが接続へファンアウトする。
//
// 受入条件（② §10）:
//   №5 snapshot < 1KB … W-10 で実測済み（avg 523B）
//   №6 不正メッセージ … 本ファイルの `handleMessage` が全部引き受ける
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
	MAX_CLIENT_MESSAGE_BYTES,
	MAX_CONSECUTIVE_SCHEMA_VIOLATIONS,
	WS_CLOSE,
	WS_PROTOCOL_VERSION,
	WS_RATE_LIMIT,
	envelopeSchema,
	gameClientMessageSchema,
	makeWsError,
	type WelcomeMessage,
	type WsErrorCode,
} from '@ft/shared';

import { authenticateRequest, isAllowedOrigin } from '../auth/session.js';
import { getRoom } from './rooms.js';
import type { GameRoom } from './room.js';

/** ws の WebSocket は型が環境依存なので、使う分だけを構造的に要求する */
interface Socket {
	send(data: string): void;
	close(code?: number, reason?: string): void;
	on(event: 'message', cb: (data: unknown) => void): void;
	on(event: 'close', cb: () => void): void;
	readyState: number;
}
const OPEN = 1;

/** 1接続ぶんの状態。**seq とレート制限は接続ごと**なので zod では持てない */
interface Connection {
	socket: Socket;
	userId: number;
	slot: number | null;
	joined: boolean;
	/** ② §5-A: 最後に受理した seq。これ以下は黙って破棄 */
	lastSeq: number;
	/** ② §2-A: スキーマ違反が連続でこの回数に達したら close 4001 */
	consecutiveViolations: number;
	/** ② §2-D: input のレート制限（40 msg/s）。超過分は黙って破棄 */
	inputWindowStart: number;
	inputCountInWindow: number;
}

/** roomId → その部屋を見ている接続。ルーム単位でまとめるのが配信の単位 */
const connectionsByRoom = new Map<string, Set<Connection>>();
/** roomId → 購読解除関数。ルームにつき1回だけ購読する */
const unsubscribeByRoom = new Map<string, () => void>();

export function registerGameWs(app: FastifyInstance): void {
	app.get('/ws/game/:roomId', { websocket: true }, (socket: Socket, req: FastifyRequest) => {
		void handleConnection(socket, req, app);
	});
}

async function handleConnection(
	socket: Socket,
	req: FastifyRequest,
	app: FastifyInstance,
): Promise<void> {
	// ② §1: Origin 検査（CSRF-over-WS 対策）。アップグレード時に見る。
	// ※ ② はこの拒否に close コードを割り当てていないため 4003 を使う（判断）
	if (!isAllowedOrigin(req)) {
		socket.close(WS_CLOSE.notAllowed, 'origin not allowed');
		return;
	}

	// ② §1: Cookie を検証。未認証は close 4000。実装は W-04/W-05（いまはスタブ）
	const user = await authenticateRequest(req);
	if (!user) {
		socket.close(WS_CLOSE.unauthenticated, 'unauthenticated');
		return;
	}

	const { roomId } = req.params as { roomId: string };
	const room = getRoom(roomId);
	// ② §2-B: ルームが無い / 既に閉鎖は 4002
	if (!room) {
		socket.close(WS_CLOSE.roomNotFound, `room ${roomId} not found`);
		return;
	}

	const conn: Connection = {
		socket,
		userId: user.userId,
		slot: null,
		joined: false,
		lastSeq: -1,
		consecutiveViolations: 0,
		inputWindowStart: Date.now(),
		inputCountInWindow: 0,
	};

	// ② §1: 同一ユーザーの多重接続は旧接続を close 4004 で置換
	const peers = ensureRoomConnections(roomId, room);
	for (const other of peers) {
		if (other.userId === conn.userId) {
			other.socket.close(WS_CLOSE.replaced, 'replaced by a newer connection');
			peers.delete(other);
		}
	}
	peers.add(conn);

	socket.on('message', (raw: unknown) => {
		handleMessage(conn, room, raw, app);
	});
	socket.on('close', () => {
		peers.delete(conn);
		// 席を AI へ戻す。猶予つきの切断処理は W-12 が上に載せる
		if (conn.slot !== null) room.leave(conn.slot);
		if (peers.size === 0) releaseRoomConnections(roomId);
	});
}

/** ルームの購読はルームにつき1回。接続ごとに購読すると stringify が接続数ぶん走る */
function ensureRoomConnections(roomId: string, room: GameRoom): Set<Connection> {
	let peers = connectionsByRoom.get(roomId);
	if (peers) return peers;
	peers = new Set<Connection>();
	connectionsByRoom.set(roomId, peers);
	const unsubscribe = room.subscribe((_message, serialized) => {
		// ② §5-B: 全参加者へ**同一の**シリアライズ済み文字列を送る
		for (const c of peers) {
			if (c.joined && c.socket.readyState === OPEN) c.socket.send(serialized);
		}
	});
	unsubscribeByRoom.set(roomId, unsubscribe);
	return peers;
}

function releaseRoomConnections(roomId: string): void {
	unsubscribeByRoom.get(roomId)?.();
	unsubscribeByRoom.delete(roomId);
	connectionsByRoom.delete(roomId);
}

/**
 * ② §10 受入条件 №6 の本体。不正メッセージを4種類に分けて処理する。
 *
 * **「事故」と「違反」を分けているのが要点。**
 *   - seq 逆行・レート超過は正常な運用でも起きる → **黙って破棄**
 *   - スキーマ違反は古いクライアントかもしれない → **error を返すが切断しない**（連続10回で切る）
 *   - 4KB 超は弁解の余地なし → **即 close**
 */
function handleMessage(
	conn: Connection,
	room: GameRoom,
	raw: unknown,
	app: FastifyInstance,
): void {
	// ② §2-A: 1メッセージ 4KB 上限。超過は close 4001
	const text = typeof raw === 'string' ? raw : String(raw);
	if (Buffer.byteLength(text, 'utf8') > MAX_CLIENT_MESSAGE_BYTES) {
		conn.socket.close(WS_CLOSE.protocolViolation, 'message too large');
		return;
	}

	let parsedJson: unknown;
	try {
		parsedJson = JSON.parse(text);
	} catch {
		violate(conn, 'validation_failed', 'not a JSON text frame');
		return;
	}

	// 2段構え: まず封筒だけ見て `t` を得る。こうすると
	// 「未知の t」と「壊れたメッセージ」を区別できる（② §2-A）
	const envelope = envelopeSchema.safeParse(parsedJson);
	if (!envelope.success) {
		violate(conn, 'validation_failed', 'envelope must be { t, d }');
		return;
	}

	const message = gameClientMessageSchema.safeParse(parsedJson);
	if (!message.success) {
		violate(conn, 'unknown_message', `unsupported or malformed message`, envelope.data.t);
		return;
	}
	// 正常なメッセージが来たら違反カウンタを戻す（②「連続10回」の連続）
	conn.consecutiveViolations = 0;

	switch (message.data.t) {
		case 'join':
			handleJoin(conn, room, app);
			return;
		case 'input':
			handleInput(conn, room, message.data.d);
			return;
		case 'leave':
			if (conn.slot !== null) room.leave(conn.slot);
			conn.joined = false;
			conn.slot = null;
			return;
		case 'spectate':
			// 保1（② §5-E）。設計コストのみ先払いで、実装は余力時
			conn.socket.send(JSON.stringify(makeWsError('not_participant', 'spectate is not implemented', 'spectate')));
			return;
	}
}

function handleJoin(conn: Connection, room: GameRoom, app: FastifyInstance): void {
	// ② §5-A: join はペイロードを持たない。Cookie の userId を participant 表で引く
	const slot = room.getSlotForUser(conn.userId);
	if (slot === undefined) {
		conn.socket.close(WS_CLOSE.notAllowed, 'not a participant of this room');
		return;
	}

	const resume = conn.joined;
	try {
		room.join(slot);
	} catch (err) {
		// 定員外 slot / 受け付けない状態（finished 等）。ルーム層が弾いた
		app.log.warn({ room: room.roomId, slot, err }, 'W-11: join を拒否');
		conn.socket.close(WS_CLOSE.notAllowed, 'join rejected');
		return;
	}
	conn.slot = slot;
	conn.joined = true;

	// ② §5-B: welcome は**接続ごとに内容が違う**ので一斉配信できない
	const d = room.describe();
	const welcome: WelcomeMessage = {
		t: 'welcome',
		d: {
			v: WS_PROTOCOL_VERSION,
			role: 'player',
			slot,
			// 申し送り: 席の combatant_id は slot と一致する
			combatant_id: slot,
			mode: d.mode,
			rules: d.rules,
			// サーバがロード済みの .cub をそのまま配る＝マップ不一致が原理的に起きない
			map_text: d.mapText,
			tick_rate: d.tick_rate,
			snap_rate: d.snap_rate,
			interp_ms: d.interp_ms,
			resume,
		},
	};
	conn.socket.send(JSON.stringify(welcome));
}

function handleInput(
	conn: Connection,
	room: GameRoom,
	input: { seq: number; yaw: number; mv: number; act?: number },
): void {
	if (!conn.joined || conn.slot === null) return;

	// ② §2-D: 40 msg/s。**超過分は黙って破棄**（切断しない）。
	// 30Hz 送信 + ジッタなので、正常なクライアントでも一時的に超えうる
	const now = Date.now();
	if (now - conn.inputWindowStart >= 1000) {
		conn.inputWindowStart = now;
		conn.inputCountInWindow = 0;
	}
	if (++conn.inputCountInWindow > WS_RATE_LIMIT.gameInputPerSecond) return;

	// ② §5-A: 最後に受理した seq 以下は**黙って破棄**。
	// 順序逆転は正常な運用で起きるので、エラーを返すとまともなクライアントが困る
	if (input.seq <= conn.lastSeq) return;
	conn.lastSeq = input.seq;

	// mv の 4bit を論理軸へ展開（bit0=前進 bit1=後退 bit2=左strafe bit3=右strafe）
	room.setInput(conn.slot, {
		forward: (input.mv & 0b0001) !== 0,
		backward: (input.mv & 0b0010) !== 0,
		strafeLeft: (input.mv & 0b0100) !== 0,
		strafeRight: (input.mv & 0b1000) !== 0,
		// yaw は絶対角。クライアント権威なのでそのまま渡す（NaN/Inf は zod が弾き済み）
		yaw: input.yaw,
	});
}

/** ② §2-A: スキーマ違反は error を返すだけ。ただし連続10回で close 4001 */
function violate(conn: Connection, code: WsErrorCode, msg: string, ref?: string): void {
	conn.consecutiveViolations += 1;
	if (conn.consecutiveViolations >= MAX_CONSECUTIVE_SCHEMA_VIOLATIONS) {
		conn.socket.close(WS_CLOSE.protocolViolation, 'too many schema violations');
		return;
	}
	conn.socket.send(JSON.stringify(makeWsError(code, msg, ref)));
}

/** テストとシャットダウン用 */
export function closeAllGameWs(): void {
	for (const roomId of [...connectionsByRoom.keys()]) releaseRoomConnections(roomId);
}
