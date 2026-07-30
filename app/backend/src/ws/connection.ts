// W-08: lobby/game WebSocket が共有する接続基盤（② §3-D）。
//
// gateway 固有の状態は持たず、pre-auth 上限、heartbeat、session_id 索引だけを担う。
// W-04/W-05 の logout は server が所有する ConnectionManager の
// closeSessionConnections() を呼べば、同じ Session の lobby/game を即時に
// close 4000 できる。
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

	/** frameをbyte/message上限内なら順序どおり保持する */
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

	/** 保持frameを順序どおり返し、bufferを空にする */
	drain(): unknown[] {
		const buffered = this.messages.splice(0);
		this.bytes = 0;
		return buffered;
	}

	/** 保持frameと累積byte数を破棄する */
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

export interface ConnectionManagerStats {
	connections: number;
	sessions: number;
	heartbeatTimer: boolean;
	sessionTimer: boolean;
}

/** 1 Fastify serverぶんのheartbeat・session接続索引を隔離して所有する */
export class ConnectionManager {
	private readonly connections = new Set<ConnectionEntry>();
	private readonly connectionsBySession = new Map<number, Set<ConnectionEntry>>();
	private sessionInvalidatedSockets = new WeakSet<object>();
	private heartbeatTimer: NodeJS.Timeout | null = null;
	private sessionTimer: NodeJS.Timeout | null = null;
	private validateSession: ((sessionId: number) => Promise<boolean>) | null = null;

	/** 認証済みsocketを登録し、冪等な解除関数を返す */
	registerSessionConnection(socket: ManagedSocket, sessionId: number): () => void {
		const entry: ConnectionEntry = {
			socket,
			sessionId,
			missedPongs: 0,
			nextHeartbeatAt: Date.now() + HEARTBEAT_INTERVAL_MS,
		};
		this.connections.add(entry);
		let sameSession = this.connectionsBySession.get(sessionId);
		if (!sameSession) {
			sameSession = new Set();
			this.connectionsBySession.set(sessionId, sameSession);
		}
		sameSession.add(entry);
		socket.on('pong', () => {
			if (this.connections.has(entry)) entry.missedPongs = 0;
		});
		this.ensureTimers();

		let active = true;
		return () => {
			if (!active) return;
			active = false;
			this.removeEntry(entry);
		};
	}

	/**
	 * W-04/W-05 のlogout hook。同一sessionのlobby/gameをclose 4000にする。
	 */
	closeSessionConnections(sessionId: number): void {
		for (const entry of [...(this.connectionsBySession.get(sessionId) ?? [])]) {
			this.sessionInvalidatedSockets.add(entry.socket);
			entry.socket.close(WS_CLOSE.unauthenticated, 'session invalidated');
		}
	}

	/** socketがsession失効によって閉じられたかを返す */
	wasSessionInvalidated(socket: ManagedSocket): boolean {
		return this.sessionInvalidatedSockets.has(socket);
	}

	/** DB Session再検証処理を設定し、unique sessionを60秒周期で検査する */
	setSessionValidator(
		validator: ((sessionId: number) => Promise<boolean>) | null,
	): void {
		this.validateSession = validator;
		this.ensureTimers();
	}

	/** heartbeatを1周期進め、2周期連続でpongの無いsocketをterminateする */
	runHeartbeatCycle(now = Date.now()): void {
		for (const entry of [...this.connections]) {
			if (entry.socket.readyState !== OPEN) {
				this.removeEntry(entry);
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

	/** 現在接続中のunique sessionを並列再検証する */
	async runSessionValidationCycle(): Promise<void> {
		if (!this.validateSession) return;
		const sessionIds = [...this.connectionsBySession.keys()];
		await Promise.all(
			sessionIds.map(async (sessionId) => {
				let valid = false;
				try {
					valid = await this.validateSession?.(sessionId) === true;
				} catch {
					valid = false;
				}
				if (!valid) this.closeSessionConnections(sessionId);
			}),
		);
	}

	/** 接続数・session数・timer稼働状態を返す */
	stats(): ConnectionManagerStats {
		return {
			connections: this.connections.size,
			sessions: this.connectionsBySession.size,
			heartbeatTimer: this.heartbeatTimer !== null,
			sessionTimer: this.sessionTimer !== null,
		};
	}

	/** テストまたはserver終了時に索引とtimerを破棄する */
	clear(): void {
		this.connections.clear();
		this.connectionsBySession.clear();
		this.sessionInvalidatedSockets = new WeakSet<object>();
		this.stopTimers();
		this.validateSession = null;
	}

	/** 接続集合に応じて共通timerを開始または停止する */
	private ensureTimers(): void {
		if (this.connections.size > 0 && !this.heartbeatTimer) {
			this.heartbeatTimer = setInterval(
				() => this.runHeartbeatCycle(),
				HEARTBEAT_INTERVAL_MS,
			);
			this.heartbeatTimer.unref();
		}
		if (this.connections.size > 0 && this.validateSession && !this.sessionTimer) {
			this.sessionTimer = setInterval(() => {
				void this.runSessionValidationCycle();
			}, SESSION_REVALIDATE_INTERVAL_MS);
			this.sessionTimer.unref();
		}
		if ((!this.validateSession || this.connections.size === 0) && this.sessionTimer) {
			clearInterval(this.sessionTimer);
			this.sessionTimer = null;
		}
	}

	/** 1接続を両索引から除去し、空ならtimerを止める */
	private removeEntry(entry: ConnectionEntry): void {
		if (!this.connections.delete(entry)) return;
		const sameSession = this.connectionsBySession.get(entry.sessionId);
		sameSession?.delete(entry);
		if (sameSession?.size === 0) this.connectionsBySession.delete(entry.sessionId);
		if (this.connections.size === 0) this.stopTimers();
	}

	/** heartbeatとsession再検証timerを停止する */
	private stopTimers(): void {
		if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
		if (this.sessionTimer) clearInterval(this.sessionTimer);
		this.heartbeatTimer = null;
		this.sessionTimer = null;
	}
}

/** 既存の単一server配線との互換用default manager */
export const defaultConnectionManager = new ConnectionManager();

/** @deprecated 新規serverはConnectionManager instanceを注入する */
export const registerSessionConnection = (
	socket: ManagedSocket,
	sessionId: number,
): (() => void) => defaultConnectionManager.registerSessionConnection(socket, sessionId);

/** @deprecated 新規serverはConnectionManager instanceを注入する */
export const closeSessionConnections = (sessionId: number): void =>
	defaultConnectionManager.closeSessionConnections(sessionId);

/** @deprecated 新規serverはConnectionManager instanceを注入する */
export const wasSessionInvalidated = (socket: ManagedSocket): boolean =>
	defaultConnectionManager.wasSessionInvalidated(socket);

/** @deprecated 新規serverはConnectionManager instanceを注入する */
export const setSessionValidator = (
	validator: ((sessionId: number) => Promise<boolean>) | null,
): void => defaultConnectionManager.setSessionValidator(validator);

/** @deprecated 新規serverはConnectionManager instanceを注入する */
export const runHeartbeatCycle = (now = Date.now()): void =>
	defaultConnectionManager.runHeartbeatCycle(now);

/** @deprecated 新規serverはConnectionManager instanceを注入する */
export const runSessionValidationCycle = (): Promise<void> =>
	defaultConnectionManager.runSessionValidationCycle();

/** @deprecated 新規serverはConnectionManager instanceを注入する */
export const connectionManagerStats = (): ConnectionManagerStats =>
	defaultConnectionManager.stats();

/** @deprecated 新規serverはConnectionManager instanceを注入する */
export const clearConnectionManager = (): void => defaultConnectionManager.clear();
