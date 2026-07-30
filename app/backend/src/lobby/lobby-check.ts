// W-08 の決定的検査 + 実 WebSocket 結合検査（② §10-A）。
// 実行: npm run check:lobby --workspace @ft/backend
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';

import WebSocket from 'ws';
import {
	WS_CLOSE,
	lobbyClientMessageSchema,
	lobbyServerMessageSchema,
	type LobbyServerMessage,
} from '@ft/shared';

import { buildServer } from '../index.js';
import { closeAllRooms, createRoomFromRules } from '../game/rooms.js';
import {
	clearConnectionManager,
	closeSessionConnections,
	connectionManagerStats,
	registerSessionConnection,
	runHeartbeatCycle,
	type ManagedSocket,
} from '../ws/connection.js';
import { MatchQueue, type LobbyClock } from './queue.js';
import { LobbyRooms } from './rooms.js';
import {
	UserContextRegistry,
	type FriendResolver,
	type LobbyConnection,
	type MatchPlan,
} from './state.js';
import {
	LobbyRuntime,
	type MatchPlanControls,
} from './ws.js';

type TimerHandle = ReturnType<typeof setTimeout>;

class FakeClock implements LobbyClock {
	private current = 0;
	private sequence = 0;
	private readonly tasks = new Map<
		number,
		{ due: number; interval: number | null; callback: () => void }
	>();

	now = (): number => this.current;

	setTimeout = (callback: () => void, ms: number): TimerHandle =>
		this.add(callback, ms, null);

	clearTimeout = (timer: TimerHandle): void => {
		this.tasks.delete(timer as unknown as number);
	};

	setInterval = (callback: () => void, ms: number): TimerHandle =>
		this.add(callback, ms, ms);

	clearInterval = (timer: TimerHandle): void => {
		this.tasks.delete(timer as unknown as number);
	};

	advance(ms: number): void {
		const target = this.current + ms;
		let guard = 0;
		while (true) {
			const next = [...this.tasks.entries()]
				.filter(([, task]) => task.due <= target)
				.sort((a, b) => a[1].due - b[1].due || a[0] - b[0])[0];
			if (!next) break;
			if (++guard > 100_000) throw new Error('fake clock runaway');
			const [id, task] = next;
			this.current = task.due;
			if (task.interval === null) this.tasks.delete(id);
			else task.due += task.interval;
			task.callback();
		}
		this.current = target;
	}

	pending(): number {
		return this.tasks.size;
	}

	private add(callback: () => void, ms: number, interval: number | null): TimerHandle {
		this.sequence += 1;
		this.tasks.set(this.sequence, {
			due: this.current + Math.max(0, ms),
			interval,
			callback,
		});
		return this.sequence as unknown as TimerHandle;
	}
}

class FakeLobbyConnection implements LobbyConnection {
	readonly messages: LobbyServerMessage[] = [];
	readonly serialized: string[] = [];
	readonly closes: number[] = [];
	bufferedAmount = 0;

	constructor(
		readonly connectionId: number,
		readonly userId: number,
		readonly displayName = `user-${userId}`,
		readonly sessionId = userId,
	) {}

	send(serialized: string): void {
		this.serialized.push(serialized);
		this.messages.push(lobbyServerMessageSchema.parse(JSON.parse(serialized)));
	}

	close(code: number): void {
		this.closes.push(code);
	}
}

function connect(
	registry: UserContextRegistry,
	userId: number,
	connectionId = userId,
): FakeLobbyConnection {
	const connection = new FakeLobbyConnection(connectionId, userId);
	registry.registerConnection(connection);
	return connection;
}

function latestQueueState(connection: FakeLobbyConnection) {
	return connection.messages.filter((message) => message.t === 'queue_state').at(-1);
}

async function flushPromises(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

function checkSharedWire(): void {
	const valid = [
		{ t: 'queue_join', d: { mode: 'rsp' } },
		{ t: 'queue_leave' },
		{ t: 'queue_fill_start', d: {} },
		{ t: 'room_create', d: { mode: 'rsp', rules: { map: 'rsp', target_score: 3 } } },
		{ t: 'room_create', d: { mode: 'fps' } },
		{ t: 'room_join', d: { code: ' abcd23 ' } },
		{ t: 'room_leave' },
		{ t: 'room_update_rules', d: { map: 'rsp', target_score: 21 } },
		{ t: 'room_start' },
	];
	for (const message of valid) assert.equal(lobbyClientMessageSchema.safeParse(message).success, true);
	assert.equal(
		lobbyClientMessageSchema.safeParse({
			t: 'room_create',
			d: { mode: 'rsp', rules: { map: 'rsp', target_score: 2 } },
		}).success,
		false,
	);
	assert.equal(
		lobbyClientMessageSchema.safeParse({
			t: 'room_create',
			d: { mode: 'fps', rules: { map: 'fps_duel', ai_level: 2 } },
		}).success,
		false,
	);
	const normalized = lobbyClientMessageSchema.parse({
		t: 'room_join',
		d: { code: ' abcd23 ' },
	});
	assert.equal(normalized.t === 'room_join' ? normalized.d.code : '', 'ABCD23');
}

function checkQueueAndClaims(): void {
	// mode独立・同一時刻sequence・join/leave state
	const clock = new FakeClock();
	const registry = new UserContextRegistry();
	const connections = [1, 2, 3, 4, 5, 6].map((id) => connect(registry, id));
	const plans: MatchPlan[] = [];
	const queue = new MatchQueue({ registry, clock, onMatchPlan: (plan) => plans.push(plan) });
	queue.join(1, 'one', 'rsp');
	queue.join(2, 'two', 'rsp');
	queue.join(3, 'three', 'fps');
	assert.equal(latestQueueState(connections[0]!)?.d.position, 1);
	assert.equal(latestQueueState(connections[1]!)?.d.position, 2);
	assert.equal(latestQueueState(connections[2]!)?.d.position, 1);
	queue.leave(1);
	assert.equal(latestQueueState(connections[1]!)?.d.position, 1);
	assert.equal(latestQueueState(connections[1]!)?.d.is_leader, true);
	queue.destroy();
	assert.equal(clock.pending(), 0);

	// full は RSP=4 で同期claimがちょうど1件
	const fullClock = new FakeClock();
	const fullRegistry = new UserContextRegistry();
	const fullPlans: MatchPlan[] = [];
	const fullQueue = new MatchQueue({
		registry: fullRegistry,
		clock: fullClock,
		onMatchPlan: (plan) => fullPlans.push(plan),
	});
	for (let id = 10; id < 14; id += 1) {
		connect(fullRegistry, id);
		fullQueue.join(id, `user-${id}`, 'rsp');
	}
	assert.equal(fullPlans.length, 1);
	assert.deepEqual(fullPlans[0]?.source, { kind: 'quick', reason: 'full' });
	assert.equal(fullPlans[0]?.seats.length, 4);
	assert.equal(Object.isFrozen(fullPlans[0]), true);
	assert.equal(Object.isFrozen(fullPlans[0]?.seats), true);
	assert.equal(fullQueue.fillStart(10).ok, false);

	// manual と timeout。timeout後の同着操作でもplanは増えない
	const manualClock = new FakeClock();
	const manualRegistry = new UserContextRegistry();
	const manualPlans: MatchPlan[] = [];
	const manualQueue = new MatchQueue({
		registry: manualRegistry,
		clock: manualClock,
		onMatchPlan: (plan) => manualPlans.push(plan),
	});
	for (const id of [20, 21]) {
		connect(manualRegistry, id);
		manualQueue.join(id, `user-${id}`, 'rsp');
	}
	manualQueue.fillStart(20);
	manualQueue.fillStart(20);
	assert.equal(manualPlans.length, 1);
	assert.deepEqual(manualPlans[0]?.source, { kind: 'quick', reason: 'manual' });
	assert.equal(manualPlans[0]?.seats.filter((seat) => seat.is_ai).length, 2);

	const timeoutClock = new FakeClock();
	const timeoutRegistry = new UserContextRegistry();
	const timeoutPlans: MatchPlan[] = [];
	const timeoutQueue = new MatchQueue({
		registry: timeoutRegistry,
		clock: timeoutClock,
		onMatchPlan: (plan) => timeoutPlans.push(plan),
	});
	connect(timeoutRegistry, 30);
	timeoutQueue.join(30, 'thirty', 'fps');
	timeoutClock.advance(60_000);
	timeoutQueue.fillStart(30);
	assert.equal(timeoutPlans.length, 1);
	assert.deepEqual(timeoutPlans[0]?.source, { kind: 'quick', reason: 'timeout' });

	// rollback は接続中だけ元FIFOへ。切断済みuserと古いtokenは戻らない
	const rollbackClock = new FakeClock();
	const rollbackRegistry = new UserContextRegistry();
	const rollbackPlans: MatchPlan[] = [];
	const rollbackQueue = new MatchQueue({
		registry: rollbackRegistry,
		clock: rollbackClock,
		onMatchPlan: (plan) => rollbackPlans.push(plan),
	});
	const rollbackConnections = [40, 41, 42].map((id) => connect(rollbackRegistry, id));
	for (const id of [40, 41, 42]) rollbackQueue.join(id, `user-${id}`, 'rsp');
	rollbackQueue.fillStart(40);
	const rollbackPlan = rollbackPlans[0]!;
	rollbackRegistry.removeConnection(41, rollbackConnections[1]!.connectionId);
	assert.equal(rollbackQueue.rollback(rollbackPlan), true);
	assert.equal(rollbackRegistry.getContext(41).kind, 'idle');
	assert.equal(rollbackQueue.getState(40)?.d.position, 1);
	assert.equal(rollbackQueue.getState(42)?.d.position, 2);
	assert.equal(rollbackQueue.rollback(rollbackPlan), false);

	for (const instance of [fullQueue, manualQueue, timeoutQueue, rollbackQueue]) instance.destroy();
	for (const fake of [fullClock, manualClock, timeoutClock, rollbackClock]) {
		assert.equal(fake.pending(), 0);
	}
}

function checkLobbyRooms(): void {
	const clock = new FakeClock();
	const registry = new UserContextRegistry();
	for (let id = 1; id <= 7; id += 1) connect(registry, id);
	const plans: MatchPlan[] = [];
	let draw = 0;
	const rooms = new LobbyRooms({
		registry,
		clock,
		onMatchPlan: (plan) => plans.push(plan),
		// 1室目 AAAAAA、2室目は AAAAAA 衝突後 BBBBBB
		randomInt: () => (draw++ < 12 ? 0 : 1),
	});

	const first = rooms.create(1, 'one', {
		mode: 'rsp',
		rules: { map: 'rsp', target_score: 3 },
	});
	const second = rooms.create(5, 'five', { mode: 'fps' });
	assert.equal(first.ok, true);
	assert.equal(second.ok, true);
	const firstCode = first.ok ? first.value : '';
	const secondCode = second.ok ? second.value : '';
	assert.equal(firstCode, 'AAAAAA');
	assert.equal(secondCode, 'BBBBBB');
	rooms.leave(5);

	for (const id of [2, 3, 4]) {
		assert.equal(rooms.join(id, `user-${id}`, ` ${firstCode.toLowerCase()} `).ok, true);
	}
	const full = rooms.join(6, 'six', firstCode);
	assert.equal(full.ok, false);
	assert.equal(full.ok ? '' : full.code, 'room_full');
	const nonHost = rooms.updateRules(2, { map: 'rsp', target_score: 5 });
	assert.equal(nonHost.ok ? '' : nonHost.code, 'not_host');
	const tooLow = rooms.updateRules(1, { map: 'rsp', target_score: 2 });
	assert.equal(tooLow.ok ? '' : tooLow.code, 'invalid_rules');
	const tooHigh = rooms.updateRules(1, { map: 'rsp', target_score: 22 });
	assert.equal(tooHigh.ok ? '' : tooHigh.code, 'invalid_rules');
	const wrongMap = rooms.updateRules(1, { map: 'fps_duel', target_score: 3 });
	assert.equal(wrongMap.ok ? '' : wrongMap.code, 'invalid_rules');

	rooms.leave(1);
	assert.equal(rooms.getState(firstCode)?.host_id, 2);
	for (const id of [2, 3, 4]) rooms.leave(id);
	assert.equal(rooms.getState(firstCode), null);

	// custom start / 二重start / snapshot rollback
	const created = rooms.create(1, 'one', {
		mode: 'rsp',
		rules: { map: 'rsp', target_score: 3 },
	});
	assert.equal(created.ok, true);
	const code = created.ok ? created.value : '';
	rooms.join(2, 'two', code);
	const before = rooms.getState(code);
	const started = rooms.start(1);
	assert.equal(started.ok, true);
	rooms.start(1);
	assert.equal(plans.length, 1);
	const plan = plans[0]!;
	assert.equal(plan.source.kind, 'custom');
	assert.equal(plan.seats.filter((seat) => seat.is_ai).length, 2);
	assert.equal(rooms.rollback(plan), true);
	assert.deepEqual(rooms.getState(code), before);
	assert.equal(rooms.rollback(plan), false);

	// 9.9秒復帰は同じ席。次の通常断は10秒満了で退室
	const oldTwo = registry.getConnection(2)!;
	registry.removeConnection(2, oldTwo.connectionId);
	rooms.disconnect(2);
	clock.advance(9_900);
	const replacement = new FakeLobbyConnection(200, 2, 'two');
	registry.registerConnection(replacement);
	rooms.resend(2);
	clock.advance(100);
	assert.equal(rooms.getState(code)?.seats[1]?.user_id, 2);
	registry.removeConnection(2, replacement.connectionId);
	rooms.disconnect(2);
	clock.advance(10_000);
	assert.equal(rooms.getState(code)?.seats[1]?.user_id, null);

	// starting中logoutは生成失敗rollback時に即退室
	const third = new FakeLobbyConnection(300, 3, 'three');
	registry.registerConnection(third);
	rooms.join(3, 'three', code);
	const logoutStart = rooms.start(1);
	assert.equal(logoutStart.ok, true);
	const logoutPlan = logoutStart.ok ? logoutStart.value : null;
	registry.removeConnection(3, third.connectionId);
	rooms.logout(3);
	assert.equal(logoutPlan ? rooms.rollback(logoutPlan) : false, true);
	assert.equal(rooms.getState(code)?.seats[1]?.user_id, null);
	rooms.leave(1);
	assert.equal(rooms.roomCount(), 0);
	rooms.destroy();
	assert.equal(clock.pending(), 0);
}

async function checkPresence(): Promise<void> {
	const resolver: FriendResolver = {
		getAcceptedFriendIds: async (userId) => (userId === 1 ? [2] : []),
	};
	const registry = new UserContextRegistry(resolver);
	const friend = connect(registry, 2);
	const stranger = connect(registry, 3);
	const self = connect(registry, 1);
	await flushPromises();
	registry.enterQueue(1, {
		mode: 'rsp',
		displayName: 'one',
		joinedAt: 0,
		sequence: 1,
	});
	await flushPromises();
	const token = registry.claimQuick([1], 'manual');
	assert.ok(token);
	registry.commitMatch(token, 'room-presence', 'rsp', [{ userId: 1, slot: 0 }]);
	await flushPromises();
	registry.releaseMatch(1, 'room-presence');
	await flushPromises();
	registry.broadcastMatchResult({
		match_id: 1,
		mode: 'rsp',
		end_reason: 'score',
		winner_team: 0,
		winner_user_id: null,
		players: [],
	});
	assert.equal(friend.serialized.at(-1), stranger.serialized.at(-1));
	assert.equal(friend.messages.at(-1)?.t, 'match_result');
	assert.equal(stranger.messages.at(-1)?.t, 'match_result');
	registry.removeConnection(1, self.connectionId);
	await flushPromises();
	const friendStatuses = friend.messages
		.filter((message) => message.t === 'presence_update' && message.d.user_id === 1)
		.map((message) => (message.t === 'presence_update' ? message.d.status : ''));
	assert.deepEqual(friendStatuses, ['online', 'in_queue', 'in_game', 'online', 'offline']);
	assert.equal(
		stranger.messages.filter(
			(message) => message.t === 'presence_update' && message.d.user_id === 1,
		).length,
		0,
	);

	// resolver完了順が逆でも古いversionは後着しない
	const deferred: ((ids: readonly number[]) => void)[] = [];
	const delayedRegistry = new UserContextRegistry({
		getAcceptedFriendIds: (userId) =>
			userId === 10
				? new Promise((resolve) => deferred.push(resolve))
				: Promise.resolve([]),
	});
	const delayedFriend = connect(delayedRegistry, 11);
	connect(delayedRegistry, 10);
	delayedRegistry.enterQueue(10, {
		mode: 'fps',
		displayName: 'ten',
		joinedAt: 0,
		sequence: 1,
	});
	assert.equal(deferred.length, 2);
	deferred[1]!([11]);
	await flushPromises();
	deferred[0]!([11]);
	await flushPromises();
	const delayedStatuses = delayedFriend.messages
		.filter((message) => message.t === 'presence_update' && message.d.user_id === 10)
		.map((message) => (message.t === 'presence_update' ? message.d.status : ''));
	assert.deepEqual(delayedStatuses, ['in_queue']);

	const old = delayedRegistry.getConnection(10)!;
	delayedRegistry.registerConnection(new FakeLobbyConnection(999, 10));
	assert.equal(delayedRegistry.onlineCount(), 2);
	assert.equal(old.connectionId, 10);
}

function checkPrepareTimeout(): void {
	const clock = new FakeClock();
	let capturedPlan: MatchPlan | null = null;
	const capture: { controls?: MatchPlanControls } = {};
	const runtime = new LobbyRuntime({
		clock,
		onMatchPlan: (plan, next) => {
			capturedPlan = plan;
			capture.controls = next;
		},
	});
	connect(runtime.registry, 70);
	runtime.queue.join(70, 'seventy', 'rsp');
	runtime.queue.fillStart(70);
	assert.equal(runtime.activePlanCount(), 1);
	clock.advance(4_999);
	assert.equal(runtime.activePlanCount(), 1);
	clock.advance(1);
	assert.equal(runtime.activePlanCount(), 0);
	assert.equal(runtime.registry.getContext(70).kind, 'queued');
	assert.equal(capture.controls?.signal.aborted, true);
	let discarded = 0;
	assert.equal(
		capture.controls?.commit('late-room', () => {
			discarded += 1;
		}),
		false,
	);
	assert.equal(discarded, 1);
	assert.ok(capturedPlan);
	runtime.destroy();
	assert.equal(clock.pending(), 0);

	const commitClock = new FakeClock();
	const commitCapture: { controls?: MatchPlanControls } = {};
	const committed = new LobbyRuntime({
		clock: commitClock,
		onMatchPlan: (_plan, next) => {
			commitCapture.controls = next;
		},
	});
	const user = connect(committed.registry, 71);
	committed.queue.join(71, 'seventy-one', 'fps');
	committed.queue.fillStart(71);
	assert.equal(commitCapture.controls?.commit('game-room'), true);
	assert.equal(committed.registry.getContext(71).kind, 'in_match');
	assert.equal(user.messages.some((message) => message.t === 'match_found'), true);
	assert.equal(committed.rateLimitUserAction(99, 'room_create', 0), true);
	assert.equal(committed.rateLimitUserAction(99, 'room_create', 1), true);
	assert.equal(committed.rateLimitUserAction(99, 'room_create', 2), true);
	assert.equal(committed.rateLimitUserAction(99, 'room_create', 3), false);
	committed.destroy();
	assert.equal(commitClock.pending(), 0);
}

class WsClient {
	readonly messages: LobbyServerMessage[] = [];
	readonly invalidMessages: unknown[] = [];
	closedWith: number | null = null;
	private readonly socket: WebSocket;

	constructor(url: string, userId?: number, origin?: string) {
		this.socket = new WebSocket(url, {
			headers: userId === undefined ? undefined : { 'x-dev-user': String(userId) },
			origin,
		});
		this.socket.on('message', (raw) => {
			const json: unknown = JSON.parse(String(raw));
			const parsed = lobbyServerMessageSchema.safeParse(json);
			if (parsed.success) this.messages.push(parsed.data);
			else this.invalidMessages.push(json);
		});
		this.socket.on('close', (code) => {
			this.closedWith = code;
		});
	}

	async open(): Promise<void> {
		if (this.socket.readyState === WebSocket.OPEN) return;
		await new Promise<void>((resolve, reject) => {
			const timer = setTimeout(() => reject(new Error('WebSocket open timeout')), 3_000);
			this.socket.once('open', () => {
				clearTimeout(timer);
				resolve();
			});
			this.socket.once('error', (error) => {
				clearTimeout(timer);
				reject(error);
			});
		});
	}

	send(message: unknown): void {
		this.socket.send(JSON.stringify(message));
	}

	sendRaw(raw: string): void {
		this.socket.send(raw);
	}

	close(): void {
		this.socket.close();
	}

	async waitFor(predicate: () => boolean, label: string): Promise<void> {
		const started = Date.now();
		while (Date.now() - started < 3_000) {
			if (predicate()) return;
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		throw new Error(`timeout waiting for ${label}`);
	}
}

async function checkRealWebSocket(): Promise<void> {
	process.env.NODE_ENV = 'development';
	process.env.ALLOW_DEV_AUTH = 'true';
	const app = await buildServer();
	app.log.level = 'silent';
	await app.listen({ port: 0, host: '127.0.0.1' });
	const port = (app.server.address() as AddressInfo).port;
	const url = `ws://127.0.0.1:${port}/ws/lobby`;
	const origin = `http://127.0.0.1:${port}`;
	const clients: WsClient[] = [];
	try {
		const normal = new WsClient(url, 1, origin);
		clients.push(normal);
		await normal.open();
		await normal.waitFor(() => normal.messages.length > 0, 'lobby_hello');
		assert.equal(normal.messages[0]?.t, 'lobby_hello');
		assert.equal(
			normal.messages[0]?.t === 'lobby_hello' ? normal.messages[0].d.v : 0,
			1,
		);
		assert.equal(normal.invalidMessages.length, 0);

		const unauthenticated = new WsClient(url, undefined, origin);
		clients.push(unauthenticated);
		await unauthenticated.open();
		await unauthenticated.waitFor(
			() => unauthenticated.closedWith !== null,
			'unauthenticated close',
		);
		assert.equal(unauthenticated.closedWith, WS_CLOSE.unauthenticated);

		const badOrigin = new WsClient(url, 2, 'https://evil.example');
		clients.push(badOrigin);
		await badOrigin.open();
		await badOrigin.waitFor(() => badOrigin.closedWith !== null, 'origin close');
		assert.equal(badOrigin.closedWith, WS_CLOSE.notAllowed);

		const oversized = new WsClient(url, 3, origin);
		clients.push(oversized);
		await oversized.open();
		oversized.sendRaw('x'.repeat(4_097));
		await oversized.waitFor(() => oversized.closedWith !== null, 'oversized close');
		assert.equal(oversized.closedWith, WS_CLOSE.protocolViolation);

		const violations = new WsClient(url, 4, origin);
		clients.push(violations);
		await violations.open();
		for (let i = 0; i < 10; i += 1) violations.send({ t: `unknown_${i}`, d: {} });
		await violations.waitFor(() => violations.closedWith !== null, 'violation close');
		assert.equal(violations.closedWith, WS_CLOSE.protocolViolation);

		const rateLimited = new WsClient(url, 6, origin);
		clients.push(rateLimited);
		await rateLimited.open();
		for (let i = 0; i < 15; i += 1) rateLimited.send({ t: 'queue_leave' });
		await rateLimited.waitFor(() => rateLimited.closedWith !== null, 'rate limit close');
		assert.equal(rateLimited.closedWith, WS_CLOSE.rateLimited);

		const old = new WsClient(url, 5, origin);
		clients.push(old);
		await old.open();
		old.send({ t: 'queue_join', d: { mode: 'rsp' } });
		await old.waitFor(
			() => old.messages.some((message) => message.t === 'queue_state'),
			'old queue state',
		);
		const replacement = new WsClient(url, 5, origin);
		clients.push(replacement);
		await replacement.open();
		await old.waitFor(() => old.closedWith !== null, 'replacement close');
		await replacement.waitFor(
			() => replacement.messages.some((message) => message.t === 'queue_state'),
			'replacement queue state',
		);
		assert.equal(old.closedWith, WS_CLOSE.replaced);
		replacement.close();
		await replacement.waitFor(
			() => replacement.closedWith !== null,
			'replacement normal close',
		);
		const afterDisconnect = new WsClient(url, 5, origin);
		clients.push(afterDisconnect);
		await afterDisconnect.open();
		await afterDisconnect.waitFor(
			() => afterDisconnect.messages.some((message) => message.t === 'lobby_hello'),
			'reconnect hello',
		);
		await new Promise((resolve) => setTimeout(resolve, 50));
		assert.equal(
			afterDisconnect.messages.some((message) => message.t === 'queue_state'),
			false,
		);

		// logout hook は同じsessionの lobby/game 双方を4000にする
		await createRoomFromRules({
			roomId: 'session-check',
			mode: 'rsp',
			participants: [{ userId: 88, slot: 0 }],
			humanSlots: [0],
			log: { info: () => {}, warn: () => {} },
		});
		const lobbySession = new WsClient(url, 88, origin);
		clients.push(lobbySession);
		await lobbySession.open();
		const gameSocket = new WebSocket(
			`ws://127.0.0.1:${port}/ws/game/session-check`,
			{ headers: { 'x-dev-user': '88' }, origin },
		);
		let gameClosed: number | null = null;
		gameSocket.on('close', (code) => {
			gameClosed = code;
		});
		await new Promise<void>((resolve, reject) => {
			gameSocket.once('open', resolve);
			gameSocket.once('error', reject);
		});
		closeSessionConnections(88);
		await lobbySession.waitFor(
			() => lobbySession.closedWith !== null,
			'lobby session close',
		);
		const started = Date.now();
		while (gameClosed === null && Date.now() - started < 3_000) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		assert.equal(lobbySession.closedWith, WS_CLOSE.unauthenticated);
		assert.equal(gameClosed, WS_CLOSE.unauthenticated);
		gameSocket.close();

		const viteConfig = readFileSync(
			new URL('../../../frontend/vite.config.ts', import.meta.url),
			'utf8',
		);
		assert.match(viteConfig, /['"]\/ws['"]\s*:/);
		assert.match(viteConfig, /ws:\s*true/);
	} finally {
		for (const client of clients) client.close();
		closeAllRooms();
		await app.close();
		await new Promise((resolve) => setTimeout(resolve, 30));
	}
	assert.equal(connectionManagerStats().connections, 0);
}

function makeManagedSocket(): {
	socket: ManagedSocket;
	pings: () => number;
	closeCode: () => number | null;
} {
	let readyState = 1;
	let pingCount = 0;
	let closedWith: number | null = null;
	const closeListeners: ((code: number) => void)[] = [];
	const pongListeners: (() => void)[] = [];
	const socket = {
		get readyState() {
			return readyState;
		},
		bufferedAmount: 0,
		send: () => {},
		close: (code = 1000) => {
			if (readyState !== 1) return;
			readyState = 3;
			closedWith = code;
			for (const listener of closeListeners) listener(code);
		},
		ping: () => {
			pingCount += 1;
		},
		terminate: () => {
			if (readyState !== 1) return;
			readyState = 3;
			for (const listener of closeListeners) listener(1006);
		},
		on: (
			event: 'message' | 'close' | 'pong',
			callback: ((data: unknown) => void) | ((code: number) => void) | (() => void),
		) => {
			if (event === 'close') closeListeners.push(callback as (code: number) => void);
			else if (event === 'pong') pongListeners.push(callback as () => void);
		},
	} as ManagedSocket;
	return { socket, pings: () => pingCount, closeCode: () => closedWith };
}

function checkHeartbeatAndSessionIndex(): void {
	clearConnectionManager();
	const a = makeManagedSocket();
	const b = makeManagedSocket();
	const unregisterA = registerSessionConnection(a.socket, 500);
	const unregisterB = registerSessionConnection(b.socket, 500);
	a.socket.on('close', unregisterA);
	b.socket.on('close', unregisterB);
	const heartbeatBase = Date.now();
	runHeartbeatCycle(heartbeatBase + 10_000);
	assert.equal(a.pings(), 1);
	assert.equal(connectionManagerStats().connections, 2);
	runHeartbeatCycle(heartbeatBase + 20_000);
	assert.equal(connectionManagerStats().connections, 0);

	const lobby = makeManagedSocket();
	const game = makeManagedSocket();
	const unregisterLobby = registerSessionConnection(lobby.socket, 501);
	const unregisterGame = registerSessionConnection(game.socket, 501);
	lobby.socket.on('close', unregisterLobby);
	game.socket.on('close', unregisterGame);
	closeSessionConnections(501);
	assert.equal(lobby.closeCode(), WS_CLOSE.unauthenticated);
	assert.equal(game.closeCode(), WS_CLOSE.unauthenticated);
	assert.deepEqual(connectionManagerStats(), {
		connections: 0,
		sessions: 0,
		heartbeatTimer: false,
		sessionTimer: false,
	});
	clearConnectionManager();
}

async function main(): Promise<void> {
	console.log('W-08 検査1: shared wire');
	checkSharedWire();
	console.log('  OK: client/server schema・strict rules・room code正規化');

	console.log('W-08 検査2: FIFO / full・manual・timeout claim / rollback');
	checkQueueAndClaims();
	console.log('  OK: 3経路とも immutable MatchPlan が各1件、競合とrollbackも正常');

	console.log('W-08 検査3: LobbyRoom');
	checkLobbyRooms();
	console.log('  OK: 衝突再試行・席・rules・host委譲・grace・rollback');

	console.log('W-08 検査4: presence');
	await checkPresence();
	console.log('  OK: friend限定・4状態・version逆転防止・置換online_count');

	console.log('W-08 検査5: prepare 5秒timeout / late success');
	checkPrepareTimeout();
	console.log('  OK: abort+rollback、遅延成功はcommitせずdispose');

	console.log('W-08 検査6: 実WebSocket');
	await checkRealWebSocket();
	console.log('  OK: hello/認証/Origin/4KB/違反/置換/session/Vite契約');

	console.log('W-08 検査7: 共通heartbeat/session索引');
	checkHeartbeatAndSessionIndex();
	console.log('  OK: pongなし2周期で掃除、同一sessionのlobby/gameを4000');

	console.log('W-08: ② §10-A の実装受入条件を満たしています');
}

main().catch((error: unknown) => {
	console.error(error);
	clearConnectionManager();
	closeAllRooms();
	process.exit(1);
});
