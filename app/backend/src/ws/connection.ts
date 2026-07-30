// W-08: lobby/game WebSocket が共有する接続基盤（② §3-D）。
//
// gateway 固有の状態は持たず、pre-auth 上限、heartbeat、session_id 索引だけを担う。
// W-04/W-05 の logout は closeSessionConnections() を呼べば、同じ Session に属する
// lobby/game の双方を即時に close 4000 できる。
import { MAX_CLIENT_MESSAGE_BYTES, WS_CLOSE } from '@ft/shared';

export const PRE_AUTH_MAX_MESSAGES = 16;
export const PRE_AUTH_MAX_BYTES = MAX_CLIENT_MESSAGE_BYTES * PRE_AUTH_MAX_MESSAGES;
export const HEARTBEAT_INTERVAL_MS = 10_000;
export const SESSION_REVALIDATE_INTERVAL_MS = 60_000;

const OPEN = 1;

/** ws の実装型に依存しない、共通部で必要な最小インターフェース */
export interface ManagedSocket {
	readonly readyState: number;
	readonly bufferedAmount: number;
	send(data: string): void;
	close(code?: number, reason?: string): void;
	ping(): void;
	terminate(): void;
	on(event: 'message', cb: (data: unknown) => void): void;
	on(event: 'close', cb: (code: number) => void): void;
	on(event: 'pong', cb: () => void): void;
}

/** 認証中に到着したフレームを順序どおり、上限付きで保持する */
export class PreAuthMessageBuffer {
	private readonly messages: unknown[] = [];
	private bytes = 0;

	push(raw: unknown): boolean {
		const text = typeof raw === 'string' ? raw : String(raw);
		const size = Buffer.byteLength(text, 'utf8');
		if (
			size > MAX_CLIENT_MESSAGE_BYTES ||
			this.messages.length >= PRE_AUTH_MAX_MESSAGES ||
			this.bytes + size > PRE_AUTH_MAX_BYTES
		) {
			this.clear();
			return false;
		}
		this.messages.push(raw);
		this.bytes += size;
		return true;
	}

	drain(): unknown[] {
		const buffered = this.messages.splice(0);
		this.bytes = 0;
		return buffered;
	}

	clear(): void {
		this.messages.length = 0;
		this.bytes = 0;
	}
}

interface ConnectionEntry {
	socket: ManagedSocket;
	sessionId: number;
	missedPongs: number;
	nextHeartbeatAt: number;
}

const connections = new Set<ConnectionEntry>();
const connectionsBySession = new Map<number, Set<ConnectionEntry>>();
const sessionInvalidatedSockets = new WeakSet<object>();
let heartbeatTimer: NodeJS.Timeout | null = null;
let sessionTimer: NodeJS.Timeout | null = null;
let validateSession: ((sessionId: number) => Promise<boolean>) | null = null;

/** 認証済み socket を heartbeat と session 索引へ登録する。戻り値は冪等な解除関数 */
export function registerSessionConnection(socket: ManagedSocket, sessionId: number): () => void {
	const entry: ConnectionEntry = {
		socket,
		sessionId,
		missedPongs: 0,
		nextHeartbeatAt: Date.now() + HEARTBEAT_INTERVAL_MS,
	};
	connections.add(entry);
	let sameSession = connectionsBySession.get(sessionId);
	if (!sameSession) {
		sameSession = new Set();
		connectionsBySession.set(sessionId, sameSession);
	}
	sameSession.add(entry);
	socket.on('pong', () => {
		if (connections.has(entry)) entry.missedPongs = 0;
	});
	ensureTimers();

	let active = true;
	return () => {
		if (!active) return;
		active = false;
		removeEntry(entry);
	};
}

/**
 * W-04/W-05 の logout hook。close handler 側は wasSessionInvalidated() を見れば
 * 通常切断の grace を置かずに掃除できる。
 */
export function closeSessionConnections(sessionId: number): void {
	for (const entry of [...(connectionsBySession.get(sessionId) ?? [])]) {
		sessionInvalidatedSockets.add(entry.socket);
		entry.socket.close(WS_CLOSE.unauthenticated, 'session invalidated');
	}
}

export function wasSessionInvalidated(socket: ManagedSocket): boolean {
	return sessionInvalidatedSockets.has(socket);
}

/**
 * W-04 が DB Session 再検証を実装したときに差し込む。接続中の unique session を
 * 60秒ごとに1回だけ検証し、無効なら lobby/game をまとめて閉じる。
 */
export function setSessionValidator(
	validator: ((sessionId: number) => Promise<boolean>) | null,
): void {
	validateSession = validator;
	ensureTimers();
}

/** fake clock 検査でも同じ本体を呼べるよう1周期を公開する */
export function runHeartbeatCycle(now = Date.now()): void {
	for (const entry of [...connections]) {
		if (entry.socket.readyState !== OPEN) {
			removeEntry(entry);
			continue;
		}
		if (now < entry.nextHeartbeatAt) continue;
		entry.nextHeartbeatAt = now + HEARTBEAT_INTERVAL_MS;
		entry.missedPongs += 1;
		if (entry.missedPongs >= 2) {
			entry.socket.terminate();
			continue;
		}
		entry.socket.ping();
	}
}

export async function runSessionValidationCycle(): Promise<void> {
	if (!validateSession) return;
	const sessionIds = [...connectionsBySession.keys()];
	await Promise.all(
		sessionIds.map(async (sessionId) => {
			let valid = false;
			try {
				valid = await validateSession?.(sessionId) === true;
			} catch {
				valid = false;
			}
			if (!valid) closeSessionConnections(sessionId);
		}),
	);
}

export function connectionManagerStats(): {
	connections: number;
	sessions: number;
	heartbeatTimer: boolean;
	sessionTimer: boolean;
} {
	return {
		connections: connections.size,
		sessions: connectionsBySession.size,
		heartbeatTimer: heartbeatTimer !== null,
		sessionTimer: sessionTimer !== null,
	};
}

/** テスト/サーバ終了用。socket 自体は gateway/server が閉じる */
export function clearConnectionManager(): void {
	connections.clear();
	connectionsBySession.clear();
	stopTimers();
	validateSession = null;
}

function ensureTimers(): void {
	if (connections.size > 0 && !heartbeatTimer) {
		heartbeatTimer = setInterval(runHeartbeatCycle, HEARTBEAT_INTERVAL_MS);
		heartbeatTimer.unref();
	}
	if (connections.size > 0 && validateSession && !sessionTimer) {
		sessionTimer = setInterval(() => {
			void runSessionValidationCycle();
		}, SESSION_REVALIDATE_INTERVAL_MS);
		sessionTimer.unref();
	}
	if ((!validateSession || connections.size === 0) && sessionTimer) {
		clearInterval(sessionTimer);
		sessionTimer = null;
	}
}

function removeEntry(entry: ConnectionEntry): void {
	if (!connections.delete(entry)) return;
	const sameSession = connectionsBySession.get(entry.sessionId);
	sameSession?.delete(entry);
	if (sameSession?.size === 0) connectionsBySession.delete(entry.sessionId);
	if (connections.size === 0) stopTimers();
}

function stopTimers(): void {
	if (heartbeatTimer) clearInterval(heartbeatTimer);
	if (sessionTimer) clearInterval(sessionTimer);
	heartbeatTimer = null;
	sessionTimer = null;
}
