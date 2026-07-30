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
	private readonly presenceStatuses = new Map<number, PresenceStatus>();
	private readonly friendIdsByUser = new Map<number, readonly number[]>();
	private tokenSequence = 0;

	/** friend resolverを受け取り、user contextの正本を初期化する */
	constructor(
		private readonly friendResolver: FriendResolver = {
			getAcceptedFriendIds: async () => [],
		},
	) {}

	/** userの現在contextを返し、未登録ならidleとして扱う */
	getContext(userId: number): UserContext {
		return this.contexts.get(userId) ?? IDLE;
	}

	/** 接続有無とcontextから外部公開用presenceを導出する */
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

	/** current lobby connectionを持つuser数を返す */
	onlineCount(): number {
		return this.connections.size;
	}

	/** userがcurrent lobby connectionを持つか返す */
	isConnected(userId: number): boolean {
		return this.connections.has(userId);
	}

	/** userのcurrent lobby connectionを返す */
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
		if (!previous) this.friendIdsByUser.delete(connection.userId);
		this.ensureKnown(connection.userId);
		this.publishPresence(connection.userId);
		return previous;
	}

	/** current connection だけを外す。置換旧socketなら false で何も変えない */
	removeConnection(userId: number, connectionId: number): boolean {
		const current = this.connections.get(userId);
		if (!current || current.connectionId !== connectionId) return false;
		this.connections.delete(userId);
		this.friendIdsByUser.delete(userId);
		this.publishPresence(userId);
		return true;
	}

	/** messageを一度serializeしてcurrent connectionへ送る */
	send(userId: number, message: LobbyServerMessage): boolean {
		return this.sendSerialized(userId, JSON.stringify(message));
	}

	/** 送信buffer上限を守りながらserialized messageを送る */
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

	/** 接続中user全員へ確定したmatch_resultを配信する */
	broadcastMatchResult(result: MatchResultPayload): void {
		const serialized = JSON.stringify({ t: 'match_result', d: result } satisfies LobbyServerMessage);
		for (const userId of this.connections.keys()) this.sendSerialized(userId, serialized);
	}

	/** idle userだけをqueued contextへcompare-and-setする */
	enterQueue(
		userId: number,
		context: Omit<QueuedContext, 'kind'>,
	): QueuedContext | null {
		if (this.getContext(userId).kind !== 'idle') return null;
		const next = Object.freeze({ kind: 'queued', ...context } satisfies QueuedContext);
		this.setContext(userId, next);
		return next;
	}

	/** queued userをidleへ戻す */
	leaveQueue(userId: number): boolean {
		if (this.getContext(userId).kind !== 'queued') return false;
		this.setContext(userId, IDLE);
		return true;
	}

	/** idle userだけを指定roomのcontextへcompare-and-setする */
	enterRoom(userId: number, code: string, joinedAt: number): InRoomContext | null {
		if (this.getContext(userId).kind !== 'idle') return null;
		const next = Object.freeze({ kind: 'in_room', code, joinedAt } satisfies InRoomContext);
		this.setContext(userId, next);
		return next;
	}

	/** code一致を任意検証しながらin_room userをidleへ戻す */
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

	/** queued user群を一括でquick starting_matchへclaimする */
	claimQuick(userIds: readonly number[], reason: 'full' | 'manual' | 'timeout'): string | null {
		if (
			userIds.length === 0 ||
			userIds.some((userId) => this.getContext(userId).kind !== 'queued')
		) {
			return null;
		}
		return this.claim(userIds, { kind: 'quick', reason });
	}

	/** 同じroomのmember群を一括でcustom starting_matchへclaimする */
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

	/** starting_match userを切断時にidleへ戻す */
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

	/** 指定roomIdでin_matchだったuserをidleへ解放する */
	releaseMatch(userId: number, roomId: string): boolean {
		const current = this.getContext(userId);
		if (current.kind !== 'in_match' || current.roomId !== roomId) return false;
		this.setContext(userId, IDLE);
		return true;
	}

	/** in_match contextからuser固有のmatch_foundを送る */
	sendMatchFound(userId: number): boolean {
		const current = this.getContext(userId);
		if (current.kind !== 'in_match') return false;
		const message: MatchFoundMessage = {
			t: 'match_found',
			d: { room_id: current.roomId, mode: current.mode, slot: current.slot },
		};
		return this.send(userId, message);
	}

	/** idleを含め明示的に保持しているcontext数を返す */
	contextCount(): number {
		return this.contexts.size;
	}

	/** 全context、connection、presence cacheを破棄する */
	clear(): void {
		this.contexts.clear();
		this.connections.clear();
		this.presenceVersions.clear();
		this.presenceStatuses.clear();
		this.friendIdsByUser.clear();
	}

	/** W-07 のfriend関係変更時に、次回presence fan-outで再解決させる */
	invalidateFriendCache(userId: number): void {
		this.friendIdsByUser.delete(userId);
	}

	/** user群を同じtokenのstarting_matchへ同期的に遷移させる */
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

	/** 初見userのcontextをidleとして明示登録する */
	private ensureKnown(userId: number): void {
		if (!this.contexts.has(userId)) this.contexts.set(userId, IDLE);
	}

	/** context正本を更新し、presence差分配信を開始する */
	private setContext(userId: number, context: UserContext): void {
		this.contexts.set(userId, context);
		this.publishPresence(userId);
	}

	/** status差分だけを、cache済みfriend一覧へversion保護付きで配信する */
	private publishPresence(userId: number): void {
		const status = this.getPresence(userId);
		if (this.presenceStatuses.get(userId) === status) return;
		this.presenceStatuses.set(userId, status);
		const version = (this.presenceVersions.get(userId) ?? 0) + 1;
		this.presenceVersions.set(userId, version);
		const cachedFriendIds = this.friendIdsByUser.get(userId);
		const friendIdsPromise = cachedFriendIds
			? Promise.resolve(cachedFriendIds)
			: this.friendResolver.getAcceptedFriendIds(userId);
		void friendIdsPromise
			.then((friendIds) => {
				if (this.presenceVersions.get(userId) !== version) return;
				const resolvedFriendIds =
					cachedFriendIds ?? Object.freeze([...friendIds]);
				if (!cachedFriendIds) this.friendIdsByUser.set(userId, resolvedFriendIds);
				const serialized = JSON.stringify({
					t: 'presence_update',
					d: { user_id: userId, status },
				} satisfies LobbyServerMessage);
				for (const friendId of resolvedFriendIds) this.sendSerialized(friendId, serialized);
			})
			.catch(() => {
				// presence は差分通知。resolver 障害時は REST の次回取得で自己回復する。
				if (this.presenceVersions.get(userId) === version) {
					this.presenceStatuses.delete(userId);
				}
			});
	}
}

/** W-09へ渡すMatchPlan全体を再帰的にfreezeする */
export function createMatchPlan(plan: MatchPlan): MatchPlan {
	return deepFreeze(plan);
}

/** object graphを循環し、各objectを再帰的にfreezeする */
function deepFreeze<T>(value: T): T {
	if (value && typeof value === 'object' && !Object.isFrozen(value)) {
		Object.freeze(value);
		for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
	}
	return value;
}
