// B-08: 招待コード制 LobbyRoom と custom MatchPlan の同期 claim（② §4-B）。
//
// LobbyRoom は待合室であり GameRoom ではない。open 中だけ席・host・rules を変更し、
// start の同期区間で starting に予約して不変 MatchPlan を1件だけ発行する。
import { randomInt } from 'node:crypto';

import {
	fpsRulesSchema,
	roomCodeSchema,
	rspRulesSchema,
	type CanonicalRules,
	type LobbyMode,
	type LobbySeat,
	type LobbyServerMessage,
	type RoomStatePayload,
} from '@ft/shared';

import { defaultMapId, findMap } from '../game/maps.js';
import {
	createMatchPlan,
	type CustomRollbackMember,
	type MatchPlan,
	type UserContextRegistry,
} from './state.js';
import {
	systemClock,
	type LobbyClock,
	type LobbyOperationResult,
	unrefTimer,
} from './queue.js';

export const ROOM_RECONNECT_GRACE_MS = 10_000;
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_ATTEMPTS = 32;

interface LobbyMember extends CustomRollbackMember {}

interface LobbyRoom {
	code: string;
	mode: LobbyMode;
	state: 'open' | 'starting';
	hostId: number;
	rules: CanonicalRules;
	seats: LobbySeat[];
	members: Map<number, LobbyMember>;
}

export interface LobbyRoomsOptions {
	registry: UserContextRegistry;
	onMatchPlan(plan: MatchPlan): void;
	clock?: LobbyClock;
	randomInt?: (maxExclusive: number) => number;
	onInternalError?: (message: string) => void;
}

export class LobbyRooms {
	private readonly rooms = new Map<string, LobbyRoom>();
	private readonly graceTimers = new Map<number, ReturnType<typeof setTimeout>>();
	private readonly loggedOutDuringStart = new Set<number>();
	private sequence = 0;
	private readonly registry: UserContextRegistry;
	private readonly onMatchPlan: (plan: MatchPlan) => void;
	private readonly clock: LobbyClock;
	private readonly nextRandomInt: (maxExclusive: number) => number;
	private readonly onInternalError: (message: string) => void;

	/** room依存関係とclock、招待コード乱数源を初期化する */
	constructor(options: LobbyRoomsOptions) {
		this.registry = options.registry;
		this.onMatchPlan = options.onMatchPlan;
		this.clock = options.clock ?? systemClock;
		this.nextRandomInt = options.randomInt ?? randomInt;
		this.onInternalError = options.onInternalError ?? (() => {});
	}

	/** hostをslot 0に置いたopen roomを作り招待コードを返す */
	create(
		userId: number,
		displayName: string,
		input:
			| { mode: 'rsp'; rules?: { map?: string; target_score?: number } }
			| { mode: 'fps'; rules?: { map?: string } },
	): LobbyOperationResult<string> {
		const unavailable = contextError(this.registry, userId);
		if (unavailable) return unavailable;
		const rules = canonicalizeRules(input.mode, input.rules);
		if (!rules) return failure('invalid_rules', 'rules or map do not match the selected mode');
		const code = this.reserveCode();
		if (!code) {
			this.onInternalError('room code generation collided 32 times');
			return failure('internal_error', 'could not allocate a room code');
		}

		this.sequence += 1;
		const joinedAt = this.clock.now();
		if (!this.registry.enterRoom(userId, code, joinedAt)) {
			return failure('internal_error', 'failed to enter room atomically');
		}
		const member: LobbyMember = {
			userId,
			displayName,
			joinedAt,
			sequence: this.sequence,
			slot: 0,
		};
		const room: LobbyRoom = {
			code,
			mode: input.mode,
			state: 'open',
			hostId: userId,
			rules,
			seats: emptySeats(input.mode),
			members: new Map([[userId, member]]),
		};
		room.seats[0] = humanSeat(member);
		this.rooms.set(code, room);
		this.broadcast(room);
		return { ok: true, value: code };
	}

	/** 招待コードのopen roomへ空席順でuserを参加させる */
	join(
		userId: number,
		displayName: string,
		rawCode: string,
	): LobbyOperationResult<string> {
		const unavailable = contextError(this.registry, userId);
		if (unavailable) return unavailable;
		const parsedCode = roomCodeSchema.safeParse(rawCode);
		if (!parsedCode.success) return failure('room_not_found', 'room does not exist');
		const room = this.rooms.get(parsedCode.data);
		if (!room) return failure('room_not_found', 'room does not exist');
		if (room.state === 'starting') return failure('room_starting', 'room is starting');
		const slot = room.seats.findIndex((seat) => seat.user_id === null && !seat.is_ai);
		if (slot < 0) return failure('room_full', 'room is full');

		this.sequence += 1;
		const joinedAt = this.clock.now();
		if (!this.registry.enterRoom(userId, room.code, joinedAt)) {
			return failure('internal_error', 'failed to enter room atomically');
		}
		const member: LobbyMember = {
			userId,
			displayName,
			joinedAt,
			sequence: this.sequence,
			slot,
		};
		room.members.set(userId, member);
		room.seats[slot] = humanSeat(member);
		this.broadcast(room);
		return { ok: true, value: room.code };
	}

	/** open roomからuserを冪等に退室させる */
	leave(userId: number): LobbyOperationResult {
		const context = this.registry.getContext(userId);
		if (context.kind === 'starting_match' || context.kind === 'in_match') {
			return failure('already_in_game', 'match is already starting or running');
		}
		if (context.kind !== 'in_room') return { ok: true, value: undefined };
		const room = this.rooms.get(context.code);
		if (!room) {
			this.registry.leaveRoom(userId, context.code);
			return { ok: true, value: undefined };
		}
		if (room.state === 'starting') return failure('room_starting', 'room is starting');
		this.removeMember(room, userId);
		return { ok: true, value: undefined };
	}

	/** hostだけがmode整合済みrulesへ更新できるようにする */
	updateRules(userId: number, rules: CanonicalRules): LobbyOperationResult {
		const roomResult = this.roomForMember(userId);
		if (!roomResult.ok) return roomResult;
		const room = roomResult.value;
		if (room.state === 'starting') return failure('room_starting', 'room is starting');
		if (room.hostId !== userId) return failure('not_host', 'only the host can update rules');
		const canonical = canonicalizeRules(room.mode, rules, true);
		if (!canonical) {
			return failure('invalid_rules', 'rules or map do not match the room mode');
		}
		room.rules = canonical;
		this.broadcast(room);
		return { ok: true, value: undefined };
	}

	/** roomを同期的にclaimし、空席をAIで埋めた不変planを発行する */
	start(userId: number): LobbyOperationResult<MatchPlan> {
		const roomResult = this.roomForMember(userId);
		if (!roomResult.ok) return roomResult;
		const room = roomResult.value;
		if (room.state === 'starting') return failure('room_starting', 'room is starting');
		if (room.hostId !== userId) return failure('not_host', 'only the host can start');

		const members = [...room.members.values()].sort(compareMember);
		const token = this.registry.claimRoom(
			room.code,
			members.map((member) => member.userId),
		);
		if (!token) return failure('already_in_game', 'room was already claimed');

		const rollbackSeats = room.seats.map((seat) => ({ ...seat }));
		room.state = 'starting';
		for (let slot = 0; slot < room.seats.length; slot += 1) {
			const seat = room.seats[slot];
			if (seat && seat.user_id === null && !seat.is_ai) {
				room.seats[slot] = { slot, user_id: null, display_name: 'AI', is_ai: true };
			}
		}
		const plan = createMatchPlan({
			token,
			source: { kind: 'custom', code: room.code },
			mode: room.mode,
			rules: cloneRules(room.rules),
			seats: room.seats.map((seat) => ({ ...seat })),
			participants: members.map((member) => ({
				userId: member.userId,
				slot: member.slot,
			})),
			humanSlots: members.map((member) => member.slot),
			rollback: {
				kind: 'custom',
				room: {
					code: room.code,
					mode: room.mode,
					hostId: room.hostId,
					rules: cloneRules(room.rules),
					seats: rollbackSeats,
					members: members.map((member) => ({ ...member })),
				},
			},
		});
		this.broadcast(room);
		this.onMatchPlan(plan);
		return { ok: true, value: plan };
	}

	/** 招待コードに対応する最新room_stateを返す */
	getState(code: string): RoomStatePayload | null {
		const room = this.rooms.get(code);
		return room ? roomState(room) : null;
	}

	/** 再接続したmemberへ現在のroom_stateを再送する */
	resend(userId: number): boolean {
		const context = this.registry.getContext(userId);
		const code =
			context.kind === 'in_room'
				? context.code
				: context.kind === 'starting_match' && context.source.kind === 'custom'
					? context.source.code
					: null;
		if (!code) return false;
		this.cancelGrace(userId);
		const room = this.rooms.get(code);
		return room ? this.registry.send(userId, { t: 'room_state', d: roomState(room) }) : false;
	}

	/** 通常切断では席を10秒保持する */
	disconnect(userId: number): void {
		const context = this.registry.getContext(userId);
		if (context.kind !== 'in_room') return;
		this.cancelGrace(userId);
		const timer = this.clock.setTimeout(() => {
			this.graceTimers.delete(userId);
			const latest = this.registry.getContext(userId);
			if (latest.kind !== 'in_room' || this.registry.isConnected(userId)) return;
			const room = this.rooms.get(latest.code);
			if (room?.state === 'open') this.removeMember(room, userId);
		}, ROOM_RECONNECT_GRACE_MS);
		unrefTimer(timer);
		this.graceTimers.set(userId, timer);
	}

	/** logout / Session失効はgrace無し。starting中ならrollback時に即退室させる */
	logout(userId: number): void {
		this.cancelGrace(userId);
		const context = this.registry.getContext(userId);
		if (context.kind === 'in_room') {
			const room = this.rooms.get(context.code);
			if (room?.state === 'open') this.removeMember(room, userId);
		} else if (
			context.kind === 'starting_match' &&
			context.source.kind === 'custom'
		) {
			this.loggedOutDuringStart.add(userId);
		}
	}

	/** B-09 失敗時。token が全員で一致する場合だけ snapshot を丸ごと復元する */
	rollback(plan: MatchPlan): boolean {
		if (plan.rollback.kind !== 'custom') return false;
		const snapshot = plan.rollback.room;
		const room = this.rooms.get(snapshot.code);
		if (!room || room.state !== 'starting') return false;
		if (
			plan.participants.some(({ userId }) => {
				const context = this.registry.getContext(userId);
				return context.kind !== 'starting_match' || context.token !== plan.token;
			})
		) {
			return false;
		}

		room.state = 'open';
		room.hostId = snapshot.hostId;
		room.rules = cloneRules(snapshot.rules);
		room.seats = snapshot.seats.map((seat) => ({ ...seat }));
		room.members = new Map(
			snapshot.members.map((member) => [member.userId, { ...member }]),
		);
		for (const member of snapshot.members) {
			this.registry.rollbackUser(member.userId, plan.token, {
				kind: 'in_room',
				code: snapshot.code,
				joinedAt: member.joinedAt,
			});
		}
		for (const member of snapshot.members) {
			if (this.loggedOutDuringStart.delete(member.userId)) {
				this.removeMember(room, member.userId);
			} else if (!this.registry.isConnected(member.userId)) {
				this.disconnect(member.userId);
			}
		}
		if (this.rooms.has(room.code)) this.broadcast(room);
		return true;
	}

	/** B-09 commit後に code を失効させる */
	complete(plan: MatchPlan): boolean {
		if (plan.source.kind !== 'custom') return false;
		const room = this.rooms.get(plan.source.code);
		if (!room || room.state !== 'starting') return false;
		for (const member of room.members.values()) this.cancelGrace(member.userId);
		this.rooms.delete(room.code);
		return true;
	}

	/** 現在保持しているroom数を返す */
	roomCount(): number {
		return this.rooms.size;
	}

	/** 稼働中の再接続grace timer数を返す */
	timerCount(): number {
		return this.graceTimers.size;
	}

	/** room、logout印、grace timerをすべて破棄する */
	destroy(): void {
		for (const timer of this.graceTimers.values()) this.clock.clearTimeout(timer);
		this.graceTimers.clear();
		this.loggedOutDuringStart.clear();
		this.rooms.clear();
	}

	/** 最大32回の衝突再試行で未使用の6文字招待コードを予約する */
	private reserveCode(): string | null {
		for (let attempt = 0; attempt < ROOM_CODE_ATTEMPTS; attempt += 1) {
			let code = '';
			for (let i = 0; i < 6; i += 1) {
				const index = this.nextRandomInt(ROOM_CODE_ALPHABET.length);
				if (!Number.isInteger(index) || index < 0 || index >= ROOM_CODE_ALPHABET.length) {
					throw new Error(`randomInt returned invalid index ${index}`);
				}
				code += ROOM_CODE_ALPHABET[index];
			}
			if (!this.rooms.has(code)) return code;
		}
		return null;
	}

	/** userが所属するroomをcontext検証付きで解決する */
	private roomForMember(userId: number): LobbyOperationResult<LobbyRoom> {
		const context = this.registry.getContext(userId);
		if (context.kind === 'starting_match' || context.kind === 'in_match') {
			return failure('already_in_game', 'match is already starting or running');
		}
		if (context.kind !== 'in_room') {
			return failure('room_not_found', 'not in a room');
		}
		const room = this.rooms.get(context.code);
		return room
			? { ok: true, value: room }
			: failure('room_not_found', 'room does not exist');
	}

	/** memberを席とregistryから除去し、必要ならhostを委譲する */
	private removeMember(room: LobbyRoom, userId: number): void {
		const member = room.members.get(userId);
		if (!member) return;
		this.cancelGrace(userId);
		room.members.delete(userId);
		room.seats[member.slot] = {
			slot: member.slot,
			user_id: null,
			display_name: null,
			is_ai: false,
		};
		this.registry.leaveRoom(userId, room.code);
		if (room.members.size === 0) {
			this.rooms.delete(room.code);
			return;
		}
		if (room.hostId === userId) {
			const nextHost = [...room.members.values()].sort(compareMember)[0];
			if (!nextHost) throw new Error('non-empty room lost all members');
			room.hostId = nextHost.userId;
		}
		this.broadcast(room);
	}

	/** room member全員へ同じserialized room_stateを配信する */
	private broadcast(room: LobbyRoom): void {
		const message = { t: 'room_state', d: roomState(room) } satisfies LobbyServerMessage;
		const serialized = JSON.stringify(message);
		for (const member of room.members.values()) {
			this.registry.sendSerialized(member.userId, serialized);
		}
	}

	/** userの再接続grace timerを冪等に解除する */
	private cancelGrace(userId: number): void {
		const timer = this.graceTimers.get(userId);
		if (!timer) return;
		this.clock.clearTimeout(timer);
		this.graceTimers.delete(userId);
	}
}

/** room操作前にuserの排他的contextを検証する */
function contextError(
	registry: UserContextRegistry,
	userId: number,
): LobbyOperationResult<never> | null {
	const context = registry.getContext(userId);
	if (context.kind === 'idle') return null;
	if (context.kind === 'queued') {
		return failure('queue_already_joined', 'leave the matchmaking queue first');
	}
	if (context.kind === 'in_room') return failure('already_in_room', 'already in a room');
	return failure('already_in_game', 'match is already starting or running');
}

/** modeとmap整合を確認し、既定値を補ったcanonical rulesへ変換する */
function canonicalizeRules(
	mode: LobbyMode,
	input: { map?: string; target_score?: number } | CanonicalRules | undefined,
	requireComplete = false,
): CanonicalRules | null {
	const map = input?.map ?? (requireComplete ? undefined : defaultMapId(mode));
	if (!map) return null;
	const entry = findMap(map);
	if (!entry || entry.mode !== mode) return null;
	if (mode === 'rsp') {
		const requestedTargetScore =
			input && 'target_score' in input ? input.target_score : undefined;
		const targetScore =
			requestedTargetScore !== undefined
				? requestedTargetScore
				: requireComplete
					? undefined
					: 10;
		const parsed = rspRulesSchema.safeParse({ map, target_score: targetScore });
		return parsed.success ? parsed.data : null;
	}
	if (input && 'target_score' in input) return null;
	const parsed = fpsRulesSchema.safeParse({ map });
	if (!parsed.success) return null;
	return { map };
}

/** mode定員ぶんの空席配列を生成する */
function emptySeats(mode: LobbyMode): LobbySeat[] {
	return Array.from({ length: mode === 'rsp' ? 4 : 2 }, (_, slot) => ({
		slot,
		user_id: null,
		display_name: null,
		is_ai: false,
	}));
}

/** lobby memberをhuman seat表示へ変換する */
function humanSeat(member: LobbyMember): LobbySeat {
	return {
		slot: member.slot,
		user_id: member.userId,
		display_name: member.displayName,
		is_ai: false,
	};
}

/** 内部roomをwire用のdiscriminated room_stateへ変換する */
function roomState(room: LobbyRoom): RoomStatePayload {
	const common = {
		code: room.code,
		state: room.state,
		host_id: room.hostId,
		seats: room.seats.map((seat) => ({ ...seat })),
	};
	if (room.mode === 'rsp') {
		const rules = rspRulesSchema.parse(room.rules);
		return { ...common, mode: 'rsp', rules };
	}
	const rules = fpsRulesSchema.parse(room.rules);
	return { ...common, mode: 'fps', rules };
}

/** rules snapshotを浅く複製する */
function cloneRules(rules: CanonicalRules): CanonicalRules {
	return { ...rules };
}

/** joinedAtとsequenceによる安定参加順を比較する */
function compareMember(a: LobbyMember, b: LobbyMember): number {
	return a.joinedAt - b.joinedAt || a.sequence - b.sequence;
}

/** LobbyRooms操作の共通失敗値を生成する */
function failure(
	code:
		| 'internal_error'
		| 'queue_already_joined'
		| 'already_in_room'
		| 'already_in_game'
		| 'room_not_found'
		| 'room_full'
		| 'not_host'
		| 'room_starting'
		| 'invalid_rules',
	message: string,
): LobbyOperationResult<never> {
	return { ok: false, code, message };
}
