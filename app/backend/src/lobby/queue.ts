// W-08: mode別 FIFO と quick MatchPlan の同期 claim（② §4-A）。
import {
	type LobbyMode,
	type LobbyServerMessage,
	type WsErrorCode,
} from '@ft/shared';

import {
	createMatchPlan,
	type MatchPlan,
	type QueuedContext,
	type UserContextRegistry,
} from './state.js';

export const QUICK_MATCH_TIMEOUT_MS = 60_000;

export type LobbyOperationResult<T = undefined> =
	| { ok: true; value: T }
	| { ok: false; code: WsErrorCode; message: string };

export interface LobbyClock {
	now(): number;
	setTimeout(callback: () => void, ms: number): ReturnType<typeof setTimeout>;
	clearTimeout(timer: ReturnType<typeof setTimeout>): void;
	setInterval(callback: () => void, ms: number): ReturnType<typeof setInterval>;
	clearInterval(timer: ReturnType<typeof setInterval>): void;
}

export const systemClock: LobbyClock = {
	now: Date.now,
	setTimeout,
	clearTimeout,
	setInterval,
	clearInterval,
};

interface QueueEntry {
	userId: number;
	displayName: string;
	joinedAt: number;
	sequence: number;
}

export interface MatchQueueOptions {
	registry: UserContextRegistry;
	onMatchPlan(plan: MatchPlan): void;
	clock?: LobbyClock;
}

export class MatchQueue {
	private readonly entries: Record<LobbyMode, QueueEntry[]> = { rsp: [], fps: [] };
	private readonly claimedStates = new Map<
		number,
		Extract<LobbyServerMessage, { t: 'queue_state' }>
	>();
	private readonly deadlineTimers: Partial<
		Record<LobbyMode, ReturnType<typeof setTimeout>>
	> = {};
	private displayTimer: ReturnType<typeof setInterval> | null = null;
	private sequence = 0;
	private readonly registry: UserContextRegistry;
	private readonly onMatchPlan: (plan: MatchPlan) => void;
	private readonly clock: LobbyClock;

	/** queue依存関係を受け取り、mode別のFIFOを初期化する */
	constructor(options: MatchQueueOptions) {
		this.registry = options.registry;
		this.onMatchPlan = options.onMatchPlan;
		this.clock = options.clock ?? systemClock;
	}

	/** userをmode別FIFOへ追加し、満員なら同期的にMatchPlanをclaimする */
	join(
		userId: number,
		displayName: string,
		mode: LobbyMode,
	): LobbyOperationResult<MatchPlan | null> {
		const context = this.registry.getContext(userId);
		if (context.kind === 'queued') {
			return failure('queue_already_joined', 'already joined a matchmaking queue');
		}
		if (context.kind === 'in_room') {
			return failure('already_in_room', 'leave the custom room first');
		}
		if (context.kind === 'starting_match' || context.kind === 'in_match') {
			return failure('already_in_game', 'match is already starting or running');
		}

		this.sequence += 1;
		const entry: QueueEntry = {
			userId,
			displayName,
			joinedAt: this.clock.now(),
			sequence: this.sequence,
		};
		const queued = this.registry.enterQueue(userId, {
			mode,
			displayName,
			joinedAt: entry.joinedAt,
			sequence: entry.sequence,
		});
		if (!queued) return failure('internal_error', 'failed to enter queue atomically');
		this.entries[mode].push(entry);

		const plan =
			this.entries[mode].length >= capacity(mode) ? this.claim(mode, 'full') : null;
		this.reschedule(mode);
		this.broadcastAll();
		if (plan) this.onMatchPlan(plan);
		return { ok: true, value: plan };
	}

	/** queued userを冪等に取り除き、残りの表示とdeadlineを更新する */
	leave(userId: number): LobbyOperationResult {
		const context = this.registry.getContext(userId);
		if (context.kind !== 'queued') return { ok: true, value: undefined };
		const queue = this.entries[context.mode];
		const index = queue.findIndex((entry) => entry.userId === userId);
		if (index >= 0) queue.splice(index, 1);
		this.registry.leaveQueue(userId);
		this.reschedule(context.mode);
		this.broadcastAll();
		return { ok: true, value: undefined };
	}

	/** queue先頭のuserによるAI補完開始を同期的にclaimする */
	fillStart(userId: number): LobbyOperationResult<MatchPlan> {
		const context = this.registry.getContext(userId);
		if (context.kind !== 'queued') {
			return failure('not_leader', 'only the queue leader can start with AI');
		}
		const leader = this.entries[context.mode][0];
		if (!leader || leader.userId !== userId) {
			return failure('not_leader', 'only the queue leader can start with AI');
		}
		const plan = this.claim(context.mode, 'manual');
		if (!plan) return failure('already_in_game', 'queue was already claimed');
		this.reschedule(context.mode);
		this.broadcastAll();
		this.onMatchPlan(plan);
		return { ok: true, value: plan };
	}

	/** userへ表示すべき最新queue_stateを組み立てる */
	getState(userId: number): Extract<LobbyServerMessage, { t: 'queue_state' }> | null {
		const context = this.registry.getContext(userId);
		if (context.kind === 'starting_match' && context.source.kind === 'quick') {
			return this.claimedStates.get(userId) ?? null;
		}
		if (context.kind !== 'queued') return null;
		const queue = this.entries[context.mode];
		const index = queue.findIndex((entry) => entry.userId === userId);
		const leader = queue[0];
		if (index < 0 || !leader) return null;
		return {
			t: 'queue_state',
			d: {
				mode: context.mode,
				position: index + 1,
				waiting: queue.length,
				auto_fill_in_ms: Math.max(
					0,
					Math.ceil(leader.joinedAt + QUICK_MATCH_TIMEOUT_MS - this.clock.now()),
				),
				is_leader: index === 0,
			},
		};
	}

	/** 再接続したuserへ現在のqueue_stateを再送する */
	resend(userId: number): boolean {
		const message = this.getState(userId);
		return message ? this.registry.send(userId, message) : false;
	}

	/**
	 * W-09 の生成失敗時。接続中の参加者だけを元の joinedAt/sequence で戻し、
	 * 生成中に切断した参加者は idle にする。
	 */
	rollback(plan: MatchPlan): boolean {
		if (plan.rollback.kind !== 'quick') return false;
		let changed = false;
		for (const entry of plan.rollback.entries) {
			this.claimedStates.delete(entry.userId);
			if (!this.registry.isConnected(entry.userId)) {
				changed = this.registry.abandonStarting(entry.userId, plan.token) || changed;
				continue;
			}
			const next: QueuedContext = Object.freeze({
				kind: 'queued',
				mode: plan.mode,
				displayName: entry.displayName,
				joinedAt: entry.joinedAt,
				sequence: entry.sequence,
			});
			if (!this.registry.rollbackUser(entry.userId, plan.token, next)) continue;
			if (!this.entries[plan.mode].some((queued) => queued.userId === entry.userId)) {
				this.entries[plan.mode].push({ ...entry });
			}
			changed = true;
		}
		this.entries[plan.mode].sort(compareEntry);
		this.reschedule(plan.mode);
		this.broadcastAll();
		return changed;
	}

	/** commit済みquick planの一時queue_stateを破棄する */
	complete(plan: MatchPlan): void {
		if (plan.source.kind !== 'quick') return;
		for (const participant of plan.participants) {
			this.claimedStates.delete(participant.userId);
		}
	}

	/** 指定mode、または全modeの待機人数を返す */
	size(mode?: LobbyMode): number {
		return mode ? this.entries[mode].length : this.entries.rsp.length + this.entries.fps.length;
	}

	/** 稼働中のdeadline/display timer数を返す */
	timerCount(): number {
		return (
			Number(this.deadlineTimers.rsp !== undefined) +
			Number(this.deadlineTimers.fps !== undefined) +
			Number(this.displayTimer !== null)
		);
	}

	/** queueと全timerを破棄する */
	destroy(): void {
		for (const mode of ['rsp', 'fps'] as const) {
			const timer = this.deadlineTimers[mode];
			if (timer) this.clock.clearTimeout(timer);
			delete this.deadlineTimers[mode];
			this.entries[mode].length = 0;
		}
		if (this.displayTimer) this.clock.clearInterval(this.displayTimer);
		this.displayTimer = null;
		this.claimedStates.clear();
	}

	/** FIFO先頭をstarting_matchへ同期遷移させ、不変planを生成する */
	private claim(
		mode: LobbyMode,
		reason: 'full' | 'manual' | 'timeout',
	): MatchPlan | null {
		const queue = this.entries[mode];
		const humans = queue.slice(0, capacity(mode));
		if (humans.length === 0 || (reason === 'full' && humans.length < capacity(mode))) return null;

		const token = this.registry.claimQuick(
			humans.map((entry) => entry.userId),
			reason,
		);
		if (!token) return null;
		const leader = queue[0];
		if (!leader) throw new Error('claimed queue lost its leader');
		for (let index = 0; index < humans.length; index += 1) {
			const human = humans[index];
			if (!human) continue;
			this.claimedStates.set(human.userId, {
				t: 'queue_state',
				d: {
					mode,
					position: index + 1,
					waiting: queue.length,
					auto_fill_in_ms: Math.max(
						0,
						Math.ceil(
							leader.joinedAt + QUICK_MATCH_TIMEOUT_MS - this.clock.now(),
						),
					),
					is_leader: index === 0,
				},
			});
		}
		queue.splice(0, humans.length);

		const seats = Array.from({ length: capacity(mode) }, (_, slot) => {
			const human = humans[slot];
			return human
				? {
						slot,
						user_id: human.userId,
						display_name: human.displayName,
						is_ai: false,
					}
				: { slot, user_id: null, display_name: 'AI', is_ai: true };
		});
		const plan = createMatchPlan({
			token,
			source: { kind: 'quick', reason },
			mode,
			rules:
				mode === 'rsp'
					? { map: 'rsp', target_score: 10 }
					: { map: 'fps_duel' },
			seats,
			participants: humans.map((entry, slot) => ({ userId: entry.userId, slot })),
			humanSlots: humans.map((_, slot) => slot),
			rollback: {
				kind: 'quick',
				entries: humans.map((entry) => ({ ...entry })),
			},
		});
		return plan;
	}

	/** 先頭userの60秒deadline到達時にAI補完planを発行する */
	private handleDeadline(mode: LobbyMode): void {
		delete this.deadlineTimers[mode];
		const leader = this.entries[mode][0];
		if (!leader) {
			this.ensureDisplayTimer();
			return;
		}
		const remaining = leader.joinedAt + QUICK_MATCH_TIMEOUT_MS - this.clock.now();
		if (remaining > 0) {
			this.reschedule(mode);
			return;
		}
		const plan = this.claim(mode, 'timeout');
		this.reschedule(mode);
		this.broadcastAll();
		if (plan) this.onMatchPlan(plan);
	}

	/** modeの先頭userに合わせてdeadline timerを張り直す */
	private reschedule(mode: LobbyMode): void {
		const old = this.deadlineTimers[mode];
		if (old) this.clock.clearTimeout(old);
		delete this.deadlineTimers[mode];
		const leader = this.entries[mode][0];
		if (leader) {
			const delay = Math.max(0, leader.joinedAt + QUICK_MATCH_TIMEOUT_MS - this.clock.now());
			const timer = this.clock.setTimeout(() => this.handleDeadline(mode), delay);
			unrefTimer(timer);
			this.deadlineTimers[mode] = timer;
		}
		this.ensureDisplayTimer();
	}

	/** 待機中user全員へ最新queue_stateを配信する */
	private broadcastAll(): void {
		for (const mode of ['rsp', 'fps'] as const) {
			for (const entry of this.entries[mode]) {
				const state = this.getState(entry.userId);
				if (state) this.registry.send(entry.userId, state);
			}
		}
	}

	/** 待機中だけ1秒周期の残時間表示timerを維持する */
	private ensureDisplayTimer(): void {
		if (this.size() > 0 && !this.displayTimer) {
			this.displayTimer = this.clock.setInterval(() => this.broadcastAll(), 1_000);
			unrefTimer(this.displayTimer);
		} else if (this.size() === 0 && this.displayTimer) {
			this.clock.clearInterval(this.displayTimer);
			this.displayTimer = null;
		}
	}
}

/** modeごとの対戦定員を返す */
function capacity(mode: LobbyMode): number {
	return mode === 'rsp' ? 4 : 2;
}

/** joinedAtとsequenceによる安定FIFO順を比較する */
function compareEntry(a: QueueEntry, b: QueueEntry): number {
	return a.joinedAt - b.joinedAt || a.sequence - b.sequence;
}

/** lobby操作の共通失敗値を生成する */
function failure(code: WsErrorCode, message: string): LobbyOperationResult<never> {
	return { ok: false, code, message };
}

/** Node timerならprocess終了を妨げないようunrefする */
export function unrefTimer(timer: ReturnType<typeof setTimeout>): void {
	const candidate = timer as ReturnType<typeof setTimeout> & { unref?: () => void };
	candidate.unref?.();
}
