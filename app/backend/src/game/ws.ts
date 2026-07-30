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
import {
	defaultConnectionManager,
	PreAuthMessageBuffer,
	type ConnectionManager,
	type ManagedSocket,
} from '../ws/connection.js';
import { getRoom } from './rooms.js';
import { FINISHED_HOLD_MS, type GameRoom } from './room.js';

/** ws の WebSocket は型が環境依存なので、使う分だけを構造的に要求する */
interface Socket extends ManagedSocket {}
const OPEN = 1;

// ② §8 バックプレッシャ。回線が詰まった接続を切らずに守るための2段構え
/** これを超えたら **その接続にだけ** snapshot を送るのをやめる（event は落とさない） */
const BACKPRESSURE_SKIP_SNAPSHOT_BYTES = 64 * 1024;
/** これを超えたら回線が死んだと判断して close 4005 */
const BACKPRESSURE_CLOSE_BYTES = 1024 * 1024;
/** ② §5-A: yaw を [-π, π) に正規化する。有限値チェックは zod 側（申し送り 7） */
function normalizeYaw(yaw: number): number {
	const wrapped = ((yaw + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
	return wrapped - Math.PI;
}

/** 1接続ぶんの状態。**seq とレート制限は接続ごと**なので zod では持てない */
interface Connection {
	socket: Socket;
	userId: number;
	slot: number | null;
	joined: boolean;
	/** 同一ユーザーの新接続に置換された旧接続か。close 時に席を解放しない */
	replaced: boolean;
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

/** Fastifyへgame gatewayを登録し、共有connection managerを注入する */
export function registerGameWs(
	app: FastifyInstance,
	connectionManager: ConnectionManager = defaultConnectionManager,
): void {
	app.get('/ws/game/:roomId', { websocket: true }, (socket: Socket, req: FastifyRequest) => {
		void handleConnection(socket, req, app, connectionManager);
	});
}

/** 1game socketの認証、room参加、置換、切断cleanupを管理する */
async function handleConnection(
	socket: Socket,
	req: FastifyRequest,
	app: FastifyInstance,
	connectionManager: ConnectionManager,
): Promise<void> {
	// ② §1: Origin 検査（CSRF-over-WS 対策）。アップグレード時に見る。
	// ※ ② はこの拒否に close コードを割り当てていないため 4003 を使う（判断）
	if (!isAllowedOrigin(req)) {
		socket.close(WS_CLOSE.notAllowed, 'origin not allowed');
		return;
	}

	// 認証中にもクライアントは送信できる。listener を先に登録して順序どおり保持し、
	// 認証・ルーム解決後に同じ handleMessage へ流す。
	const pendingMessages = new PreAuthMessageBuffer();
	let closed = false;
	let unregisterSession: (() => void) | null = null;
	let ready:
		| { conn: Connection; room: GameRoom; roomId: string; peers: Set<Connection> }
		| null = null;

	socket.on('message', (raw: unknown) => {
		if (socket.readyState !== OPEN) return;
		if (ready) {
			handleMessage(ready.conn, ready.room, raw, app);
			return;
		}

		if (!pendingMessages.push(raw)) {
			socket.close(WS_CLOSE.protocolViolation, 'too many messages before authentication');
		}
	});

	socket.on('close', () => {
		closed = true;
		pendingMessages.clear();
		unregisterSession?.();
		if (!ready) return;
		const { conn, room, roomId, peers } = ready;
		peers.delete(conn);
		app.log.info(
			{ room: roomId, user: conn.userId, slot: conn.slot, peers: peers.size },
			'W-11: WS 切断',
		);
		// 置換された旧接続の close は、新接続が引き継ぐ席を解放してはいけない。
		if (!conn.replaced && conn.slot !== null) room.leave(conn.slot);
		if (peers.size === 0) releaseRoomConnections(roomId);
	});

	// ② §1: Cookie を検証。未認証は close 4000。実装は W-04/W-05（いまはスタブ）
	const user = await authenticateRequest(req);
	if (closed || socket.readyState !== OPEN) return;
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
		replaced: false,
		lastSeq: -1,
		consecutiveViolations: 0,
		inputWindowStart: Date.now(),
		inputCountInWindow: 0,
	};
	unregisterSession = connectionManager.registerSessionConnection(
		socket,
		user.sessionId,
	);

	// ② §1: 同一ユーザーの多重接続は旧接続を close 4004 で置換
	const peers = ensureRoomConnections(roomId, room);
	for (const other of peers) {
		if (other.userId === conn.userId) {
			other.replaced = true;
			peers.delete(other);
			other.socket.close(WS_CLOSE.replaced, 'replaced by a newer connection');
		}
	}
	peers.add(conn);
	ready = { conn, room, roomId, peers };
	// ② §8: 接続/切断/join を構造化ログに残す（**input はログしない**。量とプライバシー）
	app.log.info({ room: roomId, user: conn.userId, peers: peers.size }, 'W-11: WS 接続');

	for (const raw of pendingMessages.drain()) {
		if (socket.readyState !== OPEN) break;
		handleMessage(conn, room, raw, app);
	}
}

/** ルームの購読はルームにつき1回。接続ごとに購読すると stringify が接続数ぶん走る */
function ensureRoomConnections(roomId: string, room: GameRoom): Set<Connection> {
	let peers = connectionsByRoom.get(roomId);
	if (peers) return peers;
	peers = new Set<Connection>();
	connectionsByRoom.set(roomId, peers);
	const unsubscribe = room.subscribe((message, serialized) => {
		const isSnapshot = message.t === 'snapshot';
		for (const c of peers) {
			if (!c.joined || c.socket.readyState !== OPEN) continue;

			// ② §8 バックプレッシャ: 回線が詰まっている接続を切らずに守る。
			// **snapshot は落としてよい**（次が全量なので自己回復する）が、
			// event は落とすと二度と届かないので必ず送る
			const buffered = c.socket.bufferedAmount;
			if (buffered > BACKPRESSURE_CLOSE_BYTES) {
				c.socket.close(WS_CLOSE.rateLimited, 'send buffer overflow');
				continue;
			}
			if (isSnapshot && buffered > BACKPRESSURE_SKIP_SNAPSHOT_BYTES) continue;

			c.socket.send(serialized);
		}

		// ② §6-A: finished は結果画面のため 60 秒だけ接続を維持し、満了で close 1000。
		// ルーム側の pump も同じタイミングで closed へ遷移する
		if (message.t === 'event' && message.d.kind === 'match_end') {
			const timer = setTimeout(() => {
				for (const c of peers) {
					if (c.socket.readyState === OPEN) c.socket.close(WS_CLOSE.normal, 'match finished');
				}
			}, FINISHED_HOLD_MS);
			timer.unref();
		}
	});
	unsubscribeByRoom.set(roomId, unsubscribe);
	return peers;
}

/** 接続が空になったroomの購読と接続索引を解放する */
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
			conn.lastSeq = -1;
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
	app.log.info({ room: room.roomId, user: conn.userId, slot, resume }, 'W-11: join');

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
		// ② §5-A: yaw は絶対角でクライアント権威。サーバ側の検証は
		// 「有限値チェック（zod）+ [-π,π) 正規化」のみ。回転チートは許容リスク。
		// 正規化しないと 1e30 のような巨大値が三角関数で精度を失う
		yaw: normalizeYaw(input.yaw),
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
