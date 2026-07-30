// W-08: 1ユーザー1コンテキストの正本（② §3-E）。
//
// queue / LobbyRoom / gateway は所属 Map を別々に持たず、すべて本 Registry の
// 同期 compare-and-set を通す。presence も context と現在接続から都度導出する。
import {
	WS_CLOSE,
	type CanonicalRules,
	type LobbyMode,
	type LobbySeat,
	type LobbyServerMessage,
	type MatchFoundMessage,
	type MatchResultPayload,
	type PresenceStatus,
} from '@ft/shared';

export interface FriendResolver {
	getAcceptedFriendIds(userId: number): Promise<readonly number[]>;
}

export interface LobbyConnection {
	readonly connectionId: number;
	readonly userId: number;
	readonly sessionId: number;
	readonly displayName: string;
	readonly bufferedAmount: number;
	send(serialized: string): void;
	close(code: number, reason: string): void;
}

export interface IdleContext {
	readonly kind: 'idle';
}

export interface QueuedContext {
	readonly kind: 'queued';
	readonly mode: LobbyMode;
	readonly displayName: string;
	readonly joinedAt: number;
	readonly sequence: number;
}

export interface InRoomContext {
	readonly kind: 'in_room';
	readonly code: string;
	readonly joinedAt: number;
}

export type MatchPlanSource =
	| { readonly kind: 'quick'; readonly reason: 'full' | 'manual' | 'timeout' }
	| { readonly kind: 'custom'; readonly code: string };

export interface StartingMatchContext {
	readonly kind: 'starting_match';
	readonly token: string;
	readonly source: MatchPlanSource;
	readonly previous: QueuedContext | InRoomContext;
}

export interface InMatchContext {
	readonly kind: 'in_match';
	readonly roomId: string;
	readonly mode: LobbyMode;
	readonly slot: number;
}

export type UserContext =
	| IdleContext
	| QueuedContext
	| InRoomContext
	| StartingMatchContext
	| InMatchContext;

export interface MatchPlanSeat extends LobbySeat {}

export interface QuickRollbackEntry {
	readonly userId: number;
	readonly displayName: string;
	readonly joinedAt: number;
	readonly sequence: number;
}

export interface CustomRollbackMember {
	readonly userId: number;
	readonly displayName: string;
	readonly joinedAt: number;
	readonly sequence: number;
	readonly slot: number;
}

export interface CustomRollbackSnapshot {
	readonly code: string;
	readonly mode: LobbyMode;
	readonly hostId: number;
	readonly rules: CanonicalRules;
	readonly seats: readonly MatchPlanSeat[];
	readonly members: readonly CustomRollbackMember[];
}

export type MatchPlanRollback =
	| {
			readonly kind: 'quick';
			readonly entries: readonly QuickRollbackEntry[];
	  }
	| {
			readonly kind: 'custom';
			readonly room: CustomRollbackSnapshot;
	  };

/** W-08 → W-09 の唯一の引き渡し。createMatchPlan() が再帰的に freeze する */
export interface MatchPlan {
	readonly token: string;
	readonly source: MatchPlanSource;
	readonly mode: LobbyMode;
	readonly rules: CanonicalRules;
	readonly seats: readonly MatchPlanSeat[];
	readonly participants: readonly { readonly userId: number; readonly slot: number }[];
	readonly humanSlots: readonly number[];
	readonly rollback: MatchPlanRollback;
}

const IDLE: IdleContext = Object.freeze({ kind: 'idle' });
const BACKPRESSURE_CLOSE_BYTES = 1024 * 1024;

export class UserContextRegistry {
	private readonly contexts = new Map<number, UserContext>();
	private readonly connections = new Map<number, LobbyConnection>();
	private readonly presenceVersions = new Map<number, number>();
	private tokenSequence = 0;

	constructor(
		private readonly friendResolver: FriendResolver = {
			getAcceptedFriendIds: async () => [],
		},
	) {}

	getContext(userId: number): UserContext {
		return this.contexts.get(userId) ?? IDLE;
	}

	getPresence(userId: number): PresenceStatus {
		const context = this.getContext(userId);
		switch (context.kind) {
			case 'queued':
				return 'in_queue';
			case 'starting_match':
				return context.source.kind === 'quick'
					? 'in_queue'
					: this.connections.has(userId)
						? 'online'
						: 'offline';
			case 'in_match':
				return 'in_game';
			case 'idle':
			case 'in_room':
				return this.connections.has(userId) ? 'online' : 'offline';
		}
	}

	onlineCount(): number {
		return this.connections.size;
	}

	isConnected(userId: number): boolean {
		return this.connections.has(userId);
	}

	getConnection(userId: number): LobbyConnection | undefined {
		return this.connections.get(userId);
	}

	/**
	 * 新接続を先に current として登録し、呼び出し側が返された旧接続を 4004 で閉じる。
	 * この順序により旧 close handler は connectionId 不一致となり、状態を掃除しない。
	 */
	registerConnection(connection: LobbyConnection): LobbyConnection | undefined {
		const previous = this.connections.get(connection.userId);
		this.connections.set(connection.userId, connection);
		this.ensureKnown(connection.userId);
		this.publishPresence(connection.userId);
		return previous;
	}

	/** current connection だけを外す。置換旧socketなら false で何も変えない */
	removeConnection(userId: number, connectionId: number): boolean {
		const current = this.connections.get(userId);
		if (!current || current.connectionId !== connectionId) return false;
		this.connections.delete(userId);
		this.publishPresence(userId);
		return true;
	}

	send(userId: number, message: LobbyServerMessage): boolean {
		return this.sendSerialized(userId, JSON.stringify(message));
	}

	sendSerialized(userId: number, serialized: string): boolean {
		const connection = this.connections.get(userId);
		if (!connection) return false;
		if (connection.bufferedAmount > BACKPRESSURE_CLOSE_BYTES) {
			connection.close(WS_CLOSE.rateLimited, 'send buffer overflow');
			return false;
		}
		connection.send(serialized);
		return true;
	}

	broadcastMatchResult(result: MatchResultPayload): void {
		const serialized = JSON.stringify({ t: 'match_result', d: result } satisfies LobbyServerMessage);
		for (const userId of this.connections.keys()) this.sendSerialized(userId, serialized);
	}

	enterQueue(
		userId: number,
		context: Omit<QueuedContext, 'kind'>,
	): QueuedContext | null {
		if (this.getContext(userId).kind !== 'idle') return null;
		const next = Object.freeze({ kind: 'queued', ...context } satisfies QueuedContext);
		this.setContext(userId, next);
		return next;
	}

	leaveQueue(userId: number): boolean {
		if (this.getContext(userId).kind !== 'queued') return false;
		this.setContext(userId, IDLE);
		return true;
	}

	enterRoom(userId: number, code: string, joinedAt: number): InRoomContext | null {
		if (this.getContext(userId).kind !== 'idle') return null;
		const next = Object.freeze({ kind: 'in_room', code, joinedAt } satisfies InRoomContext);
		this.setContext(userId, next);
		return next;
	}

	leaveRoom(userId: number, expectedCode?: string): boolean {
		const current = this.getContext(userId);
		if (
			current.kind !== 'in_room' ||
			(expectedCode !== undefined && current.code !== expectedCode)
		) {
			return false;
		}
		this.setContext(userId, IDLE);
		return true;
	}

	claimQuick(userIds: readonly number[], reason: 'full' | 'manual' | 'timeout'): string | null {
		if (
			userIds.length === 0 ||
			userIds.some((userId) => this.getContext(userId).kind !== 'queued')
		) {
			return null;
		}
		return this.claim(userIds, { kind: 'quick', reason });
	}

	claimRoom(code: string, userIds: readonly number[]): string | null {
		if (
			userIds.length === 0 ||
			userIds.some((userId) => {
				const context = this.getContext(userId);
				return context.kind !== 'in_room' || context.code !== code;
			})
		) {
			return null;
		}
		return this.claim(userIds, { kind: 'custom', code });
	}

	/** token が現在値と一致するuserだけを元contextへ戻す（古い完了は無害） */
	rollbackUser(userId: number, token: string, next?: QueuedContext | InRoomContext): boolean {
		const current = this.getContext(userId);
		if (current.kind !== 'starting_match' || current.token !== token) return false;
		this.setContext(userId, next ?? current.previous);
		return true;
	}

	abandonStarting(userId: number, token: string): boolean {
		const current = this.getContext(userId);
		if (current.kind !== 'starting_match' || current.token !== token) return false;
		this.setContext(userId, IDLE);
		return true;
	}

	/** W-09 成功時用。一括確認に失敗した場合は部分 commit しない */
	commitMatch(
		token: string,
		roomId: string,
		mode: LobbyMode,
		participants: readonly { userId: number; slot: number }[],
	): boolean {
		if (
			participants.some(({ userId }) => {
				const current = this.getContext(userId);
				return current.kind !== 'starting_match' || current.token !== token;
			})
		) {
			return false;
		}
		for (const participant of participants) {
			this.setContext(
				participant.userId,
				Object.freeze({
					kind: 'in_match',
					roomId,
					mode,
					slot: participant.slot,
				} satisfies InMatchContext),
			);
		}
		return true;
	}

	releaseMatch(userId: number, roomId: string): boolean {
		const current = this.getContext(userId);
		if (current.kind !== 'in_match' || current.roomId !== roomId) return false;
		this.setContext(userId, IDLE);
		return true;
	}

	sendMatchFound(userId: number): boolean {
		const current = this.getContext(userId);
		if (current.kind !== 'in_match') return false;
		const message: MatchFoundMessage = {
			t: 'match_found',
			d: { room_id: current.roomId, mode: current.mode, slot: current.slot },
		};
		return this.send(userId, message);
	}

	contextCount(): number {
		return this.contexts.size;
	}

	clear(): void {
		this.contexts.clear();
		this.connections.clear();
		this.presenceVersions.clear();
	}

	private claim(userIds: readonly number[], source: MatchPlanSource): string {
		this.tokenSequence += 1;
		const token = `claim-${this.tokenSequence.toString(36)}`;
		for (const userId of userIds) {
			const previous = this.getContext(userId);
			if (previous.kind !== 'queued' && previous.kind !== 'in_room') {
				throw new Error('claim precondition changed inside synchronous section');
			}
			this.setContext(
				userId,
				Object.freeze({
					kind: 'starting_match',
					token,
					source: Object.freeze({ ...source }),
					previous,
				} satisfies StartingMatchContext),
			);
		}
		return token;
	}

	private ensureKnown(userId: number): void {
		if (!this.contexts.has(userId)) this.contexts.set(userId, IDLE);
	}

	private setContext(userId: number, context: UserContext): void {
		this.contexts.set(userId, context);
		this.publishPresence(userId);
	}

	private publishPresence(userId: number): void {
		const version = (this.presenceVersions.get(userId) ?? 0) + 1;
		this.presenceVersions.set(userId, version);
		const status = this.getPresence(userId);
		void this.friendResolver
			.getAcceptedFriendIds(userId)
			.then((friendIds) => {
				if (this.presenceVersions.get(userId) !== version) return;
				const serialized = JSON.stringify({
					t: 'presence_update',
					d: { user_id: userId, status },
				} satisfies LobbyServerMessage);
				for (const friendId of friendIds) this.sendSerialized(friendId, serialized);
			})
			.catch(() => {
				// presence は差分通知。resolver 障害時は REST の次回取得で自己回復する。
			});
	}
}

export function createMatchPlan(plan: MatchPlan): MatchPlan {
	return deepFreeze(plan);
}

function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	}
	return value;
}
