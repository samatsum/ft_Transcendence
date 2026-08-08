// B-08: `/ws/lobby` gateway（② §3）。
//
// WebSocket を知るのはこの層だけ。wire は @ft/shared、所属と状態遷移は
// UserContextRegistry / MatchQueue / LobbyRooms に委譲する。
import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
	MAX_CLIENT_MESSAGE_BYTES,
	MAX_CONSECUTIVE_SCHEMA_VIOLATIONS,
	WS_CLOSE,
	WS_PROTOCOL_VERSION,
	WS_RATE_LIMIT,
	envelopeSchema,
	lobbyClientMessageSchema,
	makeWsError,
	type LobbyClientMessage,
	type LobbyServerMessage,
	type WsErrorCode,
} from '@ft/shared';

import { authenticateRequest, isAllowedOrigin } from '../auth/session.js';
import {
	defaultConnectionManager,
	PreAuthMessageBuffer,
	type ConnectionManager,
	type ManagedSocket,
} from '../ws/connection.js';
import {
	MatchQueue,
	systemClock,
	type LobbyClock,
	type LobbyOperationResult,
} from './queue.js';
import { LobbyRooms } from './rooms.js';
import {
	UserContextRegistry,
	type FriendResolver,
	type LobbyConnection,
	type MatchPlan,
} from './state.js';
import { prepareMatch } from './match.js';

const OPEN = 1;
const CREATE_LIMIT_PER_MINUTE = 3;
const JOIN_LIMIT_PER_MINUTE = 20;
const USER_RATE_WINDOW_MS = 60_000;
export const MATCH_PREPARE_TIMEOUT_MS = 5_000;
const KNOWN_CLIENT_TYPES = new Set([
	'queue_join',
	'queue_leave',
	'queue_fill_start',
	'room_create',
	'room_join',
	'room_leave',
	'room_update_rules',
	'room_start',
]);

export interface UserProfileResolver {
	getDisplayName(userId: number): Promise<string>;
}

export interface MatchPlanControls {
	readonly signal: AbortSignal;
	rollback(): boolean;
	/** 生成失敗をrollbackし、接続中参加者へinternal_errorを通知する */
	fail(message: string): boolean;
	/** B-09 が GameRoom 生成に成功した後だけ呼ぶ */
	commit(roomId: string, discardPreparedMatch?: () => void): boolean;
}

export interface LobbyRuntimeOptions {
	friendResolver?: FriendResolver;
	profileResolver?: UserProfileResolver;
	onMatchPlan?: (plan: MatchPlan, controls: MatchPlanControls) => void;
	clock?: LobbyClock;
	randomInt?: (maxExclusive: number) => number;
	connectionManager?: ConnectionManager;
}

interface ConnectionState {
	socket: ManagedSocket;
	connection: LobbyConnection;
	consecutiveViolations: number;
	rateWindowStartedAt: number;
	rateCount: number;
	consecutiveRateLimits: number;
	unregisterSession(): void;
}

/**
 * 1 Fastify server scopeぶんのロビー状態。テストでは直接生成して pure state を検査できる。
 */
export class LobbyRuntime {
	readonly registry: UserContextRegistry;
	readonly queue: MatchQueue;
	readonly rooms: LobbyRooms;
	private readonly activePlans = new Map<
		string,
		{
			plan: MatchPlan;
			timer: ReturnType<typeof setTimeout> | null;
			abort: AbortController;
		}
	>();
	private readonly actionHistory = new Map<string, number[]>();
	private readonly onMatchPlan?: LobbyRuntimeOptions['onMatchPlan'];
	private readonly clock: LobbyClock;

	/** lobby state componentsを同じclockとMatchPlan callbackで構築する */
	constructor(options: LobbyRuntimeOptions = {}) {
		this.registry = new UserContextRegistry(options.friendResolver);
		this.onMatchPlan = options.onMatchPlan;
		this.clock = options.clock ?? systemClock;
		const emit = (plan: MatchPlan): void => this.emitMatchPlan(plan);
		this.queue = new MatchQueue({
			registry: this.registry,
			onMatchPlan: emit,
			clock: this.clock,
		});
		this.rooms = new LobbyRooms({
			registry: this.registry,
			onMatchPlan: emit,
			clock: this.clock,
			randomInt: options.randomInt,
		});
	}

	/** room_create/joinのuser別1分windowへ1試行を記録する */
	rateLimitUserAction(
		userId: number,
		action: 'room_create' | 'room_join',
		now = this.clock.now(),
	): boolean {
		const key = `${userId}:${action}`;
		const limit =
			action === 'room_create' ? CREATE_LIMIT_PER_MINUTE : JOIN_LIMIT_PER_MINUTE;
		const recent = (this.actionHistory.get(key) ?? []).filter(
			(timestamp) => now - timestamp < USER_RATE_WINDOW_MS,
		);
		if (recent.length >= limit) {
			this.actionHistory.set(key, recent);
			return false;
		}
		recent.push(now);
		this.actionHistory.set(key, recent);
		return true;
	}

	/** runtimeへ注入されたclockの現在時刻を返す */
	now(): number {
		return this.clock.now();
	}

	/** active planをtoken一致時だけqueue/roomへrollbackする */
	rollback(plan: MatchPlan): boolean {
		const active = this.activePlans.get(plan.token);
		if (!active || active.plan !== plan) return false;
		if (active.timer) this.clock.clearTimeout(active.timer);
		active.abort.abort();
		const rolledBack =
			plan.source.kind === 'quick'
				? this.queue.rollback(plan)
				: this.rooms.rollback(plan);
		this.activePlans.delete(plan.token);
		return rolledBack;
	}

	/** active planをrollbackし、成功時だけ参加者へ生成失敗を通知する */
	fail(plan: MatchPlan, message: string): boolean {
		if (!this.rollback(plan)) return false;
		for (const participant of plan.participants) {
			this.registry.send(
				participant.userId,
				makeWsError('internal_error', message),
			);
		}
		return true;
	}

	/** GameRoom生成済みplanを一括commitし、参加者へmatch_foundを送る */
	commit(plan: MatchPlan, roomId: string, discardPreparedMatch?: () => void): boolean {
		const active = this.activePlans.get(plan.token);
		if (!active || active.plan !== plan) {
			discardPreparedMatch?.();
			return false;
		}
		if (
			!this.registry.commitMatch(plan.token, roomId, plan.mode, plan.participants)
		) {
			if (active.timer) this.clock.clearTimeout(active.timer);
			active.abort.abort();
			this.activePlans.delete(plan.token);
			discardPreparedMatch?.();
			return false;
		}
		if (active.timer) this.clock.clearTimeout(active.timer);
		if (plan.source.kind === 'custom') this.rooms.complete(plan);
		else this.queue.complete(plan);
		this.activePlans.delete(plan.token);
		for (const participant of plan.participants) {
			this.registry.sendMatchFound(participant.userId);
		}
		return true;
	}

	/** B-09の完了待ちになっているplan数を返す */
	activePlanCount(): number {
		return this.activePlans.size;
	}

	/** lobby runtimeのplan、timer、queue、room、registryを破棄する */
	destroy(): void {
		for (const active of this.activePlans.values()) {
			if (active.timer) this.clock.clearTimeout(active.timer);
			active.abort.abort();
		}
		this.queue.destroy();
		this.rooms.destroy();
		this.registry.clear();
		this.activePlans.clear();
		this.actionHistory.clear();
	}

	/** 新planをB-09 callbackへ渡し、5秒timeoutとrollbackを管理する */
	private emitMatchPlan(plan: MatchPlan): void {
		if (this.activePlans.has(plan.token)) return;
		const active = {
			plan,
			timer: null as ReturnType<typeof setTimeout> | null,
			abort: new AbortController(),
		};
		this.activePlans.set(plan.token, active);
		if (!this.onMatchPlan) {
			// B-09未接続中も user を starting_match に固着させない。
			this.fail(plan, 'match preparation is not available');
			return;
		}
		active.timer = this.clock.setTimeout(() => {
			active.timer = null;
			this.fail(plan, 'match preparation timed out');
		}, MATCH_PREPARE_TIMEOUT_MS);
		const timerWithUnref = active.timer as ReturnType<typeof setTimeout> & {
			unref?: () => void;
		};
		timerWithUnref.unref?.();
		try {
			this.onMatchPlan(plan, {
				signal: active.abort.signal,
				rollback: () => this.rollback(plan),
				fail: (message) => this.fail(plan, message),
				commit: (roomId, discard) => this.commit(plan, roomId, discard),
			});
		} catch {
			this.fail(plan, 'match preparation failed');
		}
	}
}

let connectionSequence = 0;

/** Fastifyへlobby gatewayを登録し、server scopeのruntimeを返す */
export function registerLobbyWs(
	app: FastifyInstance,
	options: LobbyRuntimeOptions = {},
): LobbyRuntime {
	let runtime: LobbyRuntime;
	const onMatchPlan =
		options.onMatchPlan ??
		((plan: MatchPlan, controls: MatchPlanControls): void => {
			void prepareMatch(plan, controls, {
				releaseMatch: (userId, roomId) => runtime.registry.releaseMatch(userId, roomId),
				broadcastMatchResult: (result) => runtime.registry.broadcastMatchResult(result),
			});
		});
	runtime = new LobbyRuntime({ ...options, onMatchPlan });
	const profileResolver = options.profileResolver ?? devProfileResolver;
	const connectionManager = options.connectionManager ?? defaultConnectionManager;

	app.get('/ws/lobby', { websocket: true }, (socket: ManagedSocket, req: FastifyRequest) => {
		void handleConnection(
			socket,
			req,
			app,
			runtime,
			profileResolver,
			connectionManager,
		);
	});
	app.addHook('onClose', async () => {
		runtime.destroy();
	});
	return runtime;
}

/** 1socketのOrigin、認証、置換、切断cleanup、pre-auth replayを管理する */
async function handleConnection(
	socket: ManagedSocket,
	req: FastifyRequest,
	app: FastifyInstance,
	runtime: LobbyRuntime,
	profileResolver: UserProfileResolver,
	connectionManager: ConnectionManager,
): Promise<void> {
	if (!isAllowedOrigin(req)) {
		socket.close(WS_CLOSE.notAllowed, 'origin not allowed');
		return;
	}

	const pending = new PreAuthMessageBuffer();
	let ready: ConnectionState | null = null;
	let closed = false;

	socket.on('message', (raw) => {
		if (socket.readyState !== OPEN) return;
		if (ready) {
			handleMessage(ready, raw, runtime);
		} else if (!pending.push(raw)) {
			socket.close(WS_CLOSE.protocolViolation, 'too many messages before authentication');
		}
	});

	socket.on('close', (code) => {
		closed = true;
		pending.clear();
		if (!ready) return;
		const state = ready;
		state.unregisterSession();
		const current = runtime.registry.removeConnection(
			state.connection.userId,
			state.connection.connectionId,
		);
		if (!current) return;

		const invalidSession =
			code === WS_CLOSE.unauthenticated ||
			connectionManager.wasSessionInvalidated(socket);
		if (invalidSession) {
			runtime.queue.leave(state.connection.userId);
			runtime.rooms.logout(state.connection.userId);
		} else {
			const context = runtime.registry.getContext(state.connection.userId);
			if (context.kind === 'queued') runtime.queue.leave(state.connection.userId);
			else if (context.kind === 'in_room') runtime.rooms.disconnect(state.connection.userId);
		}
		app.log.info(
			{ user: state.connection.userId, code, online: runtime.registry.onlineCount() },
			'B-08: lobby WS 切断',
		);
	});

	const user = await authenticateRequest(req);
	if (closed || socket.readyState !== OPEN) return;
	if (!user) {
		socket.close(WS_CLOSE.unauthenticated, 'unauthenticated');
		return;
	}

	let displayName: string;
	try {
		displayName = await profileResolver.getDisplayName(user.userId);
		if (!displayName) throw new Error('empty display name');
	} catch (error) {
		app.log.warn({ user: user.userId, error }, 'B-08: user profile 解決失敗');
		socket.close(WS_CLOSE.unauthenticated, 'user profile unavailable');
		return;
	}
	if (closed || socket.readyState !== OPEN) return;

	connectionSequence += 1;
	const connection: LobbyConnection = {
		connectionId: connectionSequence,
		userId: user.userId,
		sessionId: user.sessionId,
		displayName,
		get bufferedAmount() {
			return socket.bufferedAmount;
		},
		send: (serialized) => socket.send(serialized),
		close: (code, reason) => socket.close(code, reason),
	};
	const unregisterSession = connectionManager.registerSessionConnection(
		socket,
		user.sessionId,
	);
	ready = {
		socket,
		connection,
		consecutiveViolations: 0,
		rateWindowStartedAt: runtime.now(),
		rateCount: 0,
		consecutiveRateLimits: 0,
		unregisterSession,
	};
	const old = runtime.registry.registerConnection(connection);
	if (old && old.connectionId !== connection.connectionId) {
		old.close(WS_CLOSE.replaced, 'replaced by a newer connection');
	}

	const hello: LobbyServerMessage = {
		t: 'lobby_hello',
		d: {
			v: WS_PROTOCOL_VERSION,
			online_count: runtime.registry.onlineCount(),
			self: { status: runtime.registry.getPresence(user.userId) },
		},
	};
	runtime.registry.send(user.userId, hello);
	resendContext(user.userId, runtime);
	app.log.info(
		{ user: user.userId, online: runtime.registry.onlineCount() },
		'B-08: lobby WS 接続',
	);

	for (const raw of pending.drain()) {
		if (socket.readyState !== OPEN || !ready) break;
		handleMessage(ready, raw, runtime);
	}
}

/** 1frameをsize、schema、rate limit検証してlobby操作へdispatchする */
function handleMessage(
	connection: ConnectionState,
	raw: unknown,
	runtime: LobbyRuntime,
): void {
	const text = typeof raw === 'string' ? raw : String(raw);
	if (Buffer.byteLength(text, 'utf8') > MAX_CLIENT_MESSAGE_BYTES) {
		connection.socket.close(WS_CLOSE.protocolViolation, 'message too large');
		return;
	}

	let json: unknown;
	try {
		json = JSON.parse(text);
	} catch {
		violate(connection, 'validation_failed', 'not a JSON text frame');
		return;
	}
	const envelope = envelopeSchema.safeParse(json);
	if (!envelope.success) {
		violate(connection, 'validation_failed', 'envelope must be { t, d }');
		return;
	}
	const parsed = lobbyClientMessageSchema.safeParse(json);
	if (!parsed.success) {
		const code: WsErrorCode = !KNOWN_CLIENT_TYPES.has(envelope.data.t)
			? 'unknown_message'
			: envelope.data.t === 'room_create' ||
				  envelope.data.t === 'room_update_rules'
				? 'invalid_rules'
				: 'validation_failed';
		violate(connection, code, 'unsupported or malformed lobby message', envelope.data.t);
		return;
	}
	connection.consecutiveViolations = 0;

	const now = runtime.now();
	if (now - connection.rateWindowStartedAt >= 1_000) {
		connection.rateWindowStartedAt = now;
		connection.rateCount = 0;
	}
	if (++connection.rateCount > WS_RATE_LIMIT.lobbyPerSecond) {
		connection.consecutiveRateLimits += 1;
		if (connection.consecutiveRateLimits >= 10) {
			connection.socket.close(WS_CLOSE.rateLimited, 'too many lobby messages');
		} else {
			connection.socket.send(
				JSON.stringify(makeWsError('rate_limited', 'lobby rate limit exceeded', parsed.data.t)),
			);
		}
		return;
	}

	const result = dispatch(connection.connection, parsed.data, runtime);
	if (result.ok) connection.consecutiveRateLimits = 0;
	else {
		connection.socket.send(
			JSON.stringify(makeWsError(result.code, result.message, parsed.data.t)),
		);
	}
}

/** 検証済みclient messageを排他的なqueue/room操作へ振り分ける */
function dispatch(
	connection: LobbyConnection,
	message: LobbyClientMessage,
	runtime: LobbyRuntime,
): LobbyOperationResult<unknown> {
	switch (message.t) {
		case 'queue_join':
			return runtime.queue.join(
				connection.userId,
				connection.displayName,
				message.d.mode,
			);
		case 'queue_leave':
			return runtime.queue.leave(connection.userId);
		case 'queue_fill_start':
			return runtime.queue.fillStart(connection.userId);
		case 'room_create':
			if (!runtime.rateLimitUserAction(connection.userId, 'room_create')) {
				return { ok: false, code: 'rate_limited', message: 'room_create rate limit exceeded' };
			}
			return runtime.rooms.create(
				connection.userId,
				connection.displayName,
				message.d,
			);
		case 'room_join':
			if (!runtime.rateLimitUserAction(connection.userId, 'room_join')) {
				return { ok: false, code: 'rate_limited', message: 'room_join rate limit exceeded' };
			}
			return runtime.rooms.join(
				connection.userId,
				connection.displayName,
				message.d.code,
			);
		case 'room_leave':
			return runtime.rooms.leave(connection.userId);
		case 'room_update_rules':
			return runtime.rooms.updateRules(connection.userId, message.d);
		case 'room_start':
			return runtime.rooms.start(connection.userId);
	}
}

/** 再接続userのcontextに対応したauthoritative stateを再送する */
function resendContext(userId: number, runtime: LobbyRuntime): void {
	const context = runtime.registry.getContext(userId);
	switch (context.kind) {
		case 'queued':
			runtime.queue.resend(userId);
			return;
		case 'in_room':
			runtime.rooms.resend(userId);
			return;
		case 'starting_match':
			if (context.source.kind === 'quick') runtime.queue.resend(userId);
			else runtime.rooms.resend(userId);
			return;
		case 'in_match':
			runtime.registry.sendMatchFound(userId);
			return;
		case 'idle':
			return;
	}
}

/** schema違反を通知し、連続上限でprotocol closeする */
function violate(
	connection: ConnectionState,
	code: WsErrorCode,
	message: string,
	ref?: string,
): void {
	connection.consecutiveViolations += 1;
	if (connection.consecutiveViolations >= MAX_CONSECUTIVE_SCHEMA_VIOLATIONS) {
		connection.socket.close(WS_CLOSE.protocolViolation, 'too many schema violations');
		return;
	}
	connection.socket.send(JSON.stringify(makeWsError(code, message, ref)));
}

const devProfileResolver: UserProfileResolver = {
	getDisplayName: async (userId) => {
		if (
			process.env.NODE_ENV !== 'development' ||
			process.env.ALLOW_DEV_AUTH !== 'true'
		) {
			throw new Error('User repository is not configured');
		}
		return `dev-${userId}`;
	},
};
