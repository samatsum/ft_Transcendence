// B-10: GameRoom 本体。1試合 = 1ルーム = 1つの t_game（② §6）。
//
// 状態機械の正本は 2-WSプロトコル設計「6-A. 状態機械」:
//   created ──全人間join or 10s──► countdown(3s) ──► playing ──決着──► finished ──60s──► closed
//      └── 人間0人のまま10s ──► closed（記録なし）
//
// 本ファイルは **WS を知らない**。配信は onBroadcast コールバック経由で、
// B-11 がそこへ WebSocket.send を差し込む。
import { diffEvents } from './events.js';
import { SimGame, INPUT_SRC_AI, INPUT_SRC_EXTERNAL, NEUTRAL_INPUT, type SeatInput } from './sim.js';
import type {
	GameEvent,
	MatchEndReason,
	MatchResultPayload,
	PlayerStatusMessage,
} from '@ft/shared';
import { decodeSnapshot, type SnapshotMessage, type SnapshotPayload, type SnapshotMode } from './snapshot.js';

export type RoomState = 'created' | 'countdown' | 'playing' | 'finished' | 'closed';
export type PlayerSeatState = 'connected' | 'grace' | 'ai';
export const PLAYER_RECONNECT_GRACE_MS = 30_000;
export type RoomLifecycleReason =
	| 'countdown_ready'
	| 'countdown_timeout'
	| 'match_started'
	| 'match_end'
	| 'no_humans'
	| 'finished_hold'
	| 'discarded';

// ② §5-D のイベントと match_end.reason は `@ft/shared` の ws/game.ts が正本
// （Issue #10 で配置を合意）。GV-06/GV-07 が同じ定義を import するので、
// ここで再定義せず re-export する。
export type { MatchEndReason } from '@ft/shared';

/** ルーム層が配信するイベント（② §5-D）。B-11 が WS メッセージとして流す */
export type RoomEvent = GameEvent;

/** ② §5-B の welcome を B-11 が組み立てるために必要な、ルームが持つ情報 */
export interface RoomDescription {
	mode: SnapshotMode;
	/** welcome.map_text。サーバがロードした .cub をそのまま配る（② §5-B の単一情報源） */
	mapText: string;
	rules: { target_score: number };
	tick_rate: number;
	snap_rate: number;
	interp_ms: number;
	state: RoomState;
}

/**
 * ② §6-C 2. で永続化に渡す試合結果。これは outcome だけなので、B-09 が
 * MatchPlan を閉じ込めた closure で席・ユーザー・rules と結合し、B-13 の Prisma
 * 実装が Match / MatchPlayer 行を作って採番した id を返す。
 *
 * abandon（人間全員離脱）の場合も呼ばれる（`winner = null`, `reason = 'abandon'`）。
 * このときも Match 行を作る（③ §2-D の統計から漏らさないため）。
 */
export interface PersistedMatchContext {
	roomId: string;
	mode: SnapshotMode;
	/** RSP=チーム番号 / FPS=combatant_id / 未決着=null */
	winner: number | null;
	reason: MatchEndReason;
	/** [red, blue]。FPS は [0,0] 固定（勝敗はゴール到達のみ） */
	score: readonly [number, number];
	/** 決着時のサーバ tick 番号 */
	tick: number;
	/**
	 * 決着時に人間が接続していなかったparticipant席。
	 *
	 * grace中に通常決着した席も、② §6-C の「離脱して未復帰なら abandon」に従い含める。
	 */
	abandonedSlots: readonly number[];
}

/** ② §6-C: 永続化成功時に GameRoom が受け取る DB ID とロビー通知の組 */
export interface PersistedMatchResult {
	matchId: number;
	result: MatchResultPayload;
}

export const TICK_HZ = 30;
const TICK_MS = 1000 / TICK_HZ;
/** 偶数 tick 配信 = 実効 15Hz（② §5-C「なぜ配信は 15Hz なのか」） */
export const SNAP_HZ = TICK_HZ / 2;
/** クライアントが描画を遅らせる量。welcome で通知する（② §5-C 補間契約） */
export const INTERP_MS = 100;
/** created で人間を待つ上限（② §6-A） */
const JOIN_GRACE_MS = 10_000;
const COUNTDOWN_MS = 3_000;
/** finished で結果画面のため接続を維持する時間（② §6-A）。満了で close 1000 */
export const FINISHED_HOLD_MS = 60_000;
/**
 * 1 tick の処理がこれを超えたら過負荷とみなして警告（⑤ B-10 受入条件）。
 *
 * ② §8 は「`game_step` 所要が**周期の 50%**」と定めている。周期いっぱい（100%）で
 * 警告していては、気づいた時にはもう配信が遅れている。半分で予兆を拾う。
 */
const TICK_OVERRUN_MS = TICK_MS * 0.5;
/** 同じ警告でログを溢れさせないための間引き */
const OVERRUN_LOG_INTERVAL_MS = 1_000;

export interface RoomOptions {
	roomId: string;
	/** .cub の中身。マップ ID からの解決は B-14 の責務 */
	cubText: string;
	mode: SnapshotMode;
	targetScore: number;
	seed: number;
	/**
	 * 人間が座る予定の席（② §6-A の追補）。マッチメイキング（B-09）が渡す。
	 *
	 * ルームは全席を AI で生成するため、**どの席が人間の席かを自力では知り得ない**。
	 * ② §4-C の「全人間席の join 完了 or 10秒経過」を判定するのに必要で、
	 * **これが無いと人間2人 + AI2席の試合が毎回 10 秒待たされる**
	 * （早期開始の条件が「定員ぶんの人間が揃う」になり永久に成立しないため）。
	 *
	 * 省略時は全席が人間（クイックマッチで定員ちょうど埋まった場合と同じ）。
	 */
	humanSlots?: number[];
	/**
	 * 席に着く予定の人間の一覧（② §4-C の participant 登録）。B-09 が渡す。
	 *
	 * ゲーム WS の `join` は**ペイロードを持たない**（② §5-A）。Cookie から得た
	 * userId をこの表で slot に引き当てて本人特定する。表に無い userId は
	 * participant ではないので close `4003`。
	 *
	 * 省略時は `humanSlots` を、それも無ければ全席を人間とみなす。
	 */
	participants?: ReadonlyArray<{ userId: number; slot: number }>;
	/**
	 * 全参加者へ配信する。B-11 が WS へ差し替える。
	 *
	 * `serialized` は **ルーム内で1回だけ `JSON.stringify` した文字列**。
	 * ② §5-B が「全参加者+観戦者に同一シリアライズ済み文字列を配信
	 * （クライアント別加工なし）」と定めているので、接続ごとに stringify しない。
	 * オブジェクト側はテストと将来の分岐用。
	 */
	onBroadcast?: (message: RoomMessage, serialized: string) => void;
	/**
	 * ② §6-C 2. の永続化フック（B-13 の責務）。
	 *
	 * 最終 snapshot 配信の直後、`event(match_end)` 発火の直前に呼ばれる。
	 * 戻り値の `matchId` が `event(match_end).d.match_id` に載る（結果画面が
	 * REST `GET /api/matches/:id` を叩く経路）。
	 *
	 * **未提供 or 例外 or `null` を返した場合**は `match_id: null` で match_end を
	 * 発火する。DB行が無いので lobby WS の `match_result` も送らず、クライアントは
	 * 最終 snapshot の勝敗・スコアだけで結果画面を表示する（② §5-D）。
	 * B-13 未実装のうち（＝現在）は未提供で問題ない。
	 */
	persistMatch?: (context: PersistedMatchContext) => Promise<PersistedMatchResult | null>;
	/** match_end 配信後、永続化成功時だけロビーの match_result へ渡す */
	onMatchResult?: (result: MatchResultPayload) => void;
	/**
	 * ② §4-E: B-09 が試合終了・開始前破棄を購読し、ロビーの in_match context を解放する。
	 *
	 * GameRoom の内部状態をポーリングせずに済むよう、状態遷移の直後に同期通知する。
	 */
	onLifecycle?: (state: RoomState, reason: RoomLifecycleReason) => void;
	/** 差し替え可能にしておくとテストで時間を進められる */
	now?: () => number;
	log?: RoomLogger;
}

/** 配信の購読者。`serialized` は ② §5-B の「同一シリアライズ済み文字列」 */
export type RoomMessage = SnapshotMessage | RoomEvent | PlayerStatusMessage;
export type BroadcastListener = (message: RoomMessage, serialized: string) => void;

export interface RoomJoinResult {
	/** grace状態から30秒以内に復帰した場合だけtrue */
	resume: boolean;
}

interface PlayerSeat {
	state: PlayerSeatState;
	graceUntil: number | null;
	/** grace満了または明示leave後はplayerとして復帰できない */
	abandoned: boolean;
}

export interface RoomLogger {
	info(obj: Record<string, unknown>, msg: string): void;
	warn(obj: Record<string, unknown>, msg: string): void;
}

const consoleLogger: RoomLogger = {
	info: (obj, msg) => console.log(msg, obj),
	warn: (obj, msg) => console.warn(msg, obj),
};

/** RSP は 4 席（0,1=赤 / 2,3=青）、FPS は 2 席（申し送り 3） */
export function seatCount(mode: SnapshotMode): number {
	return mode === 'rsp' ? 4 : 2;
}

export class GameRoom {
	readonly roomId: string;
	readonly mode: SnapshotMode;

	private sim: SimGame | null = null;
	private state: RoomState = 'created';
	private tick = 0;
	private timer: NodeJS.Timeout | null = null;
	private stateEnteredAt = 0;

	/** 席ごとの最新入力。毎 tick これを sim へ流し込む（② §6-B） */
	private readonly inputs = new Map<number, SeatInput>();
	/** 人間が座っている席。空なら実質 AI 同士の試合 */
	private readonly humanSeats = new Set<number>();
	/** 人間が座る予定の席（② §6-A 追補）。early start の判定に使う */
	private readonly expectedHumanSlots: Set<number>;
	/** userId → slot（② §4-C の participant 登録）。join の本人特定に使う */
	private readonly participantSlots = new Map<number, number>();
	/** B-12: participant席ごとのconnected/grace/aiとabandonedを持つ正本 */
	private readonly playerSeats = new Map<number, PlayerSeat>();
	/** 配信の購読者。B-11 の WS 層がここに1つ登録して接続へファンアウトする */
	private readonly listeners = new Set<BroadcastListener>();

	private lastOverrunLogAt = 0;
	/** 直前に配信した snapshot。差分から point_scored / hand_changed / goal を起こす */
	private previous: SnapshotPayload | null = null;
	/**
	 * ② §6-C の永続化フェーズに入ったか。onTick と leave の両方から finish() が
	 * 呼ばれうるので、二重起動を防ぐ。true の間はタイマー停止済み・永続化 async 実行中で
	 * state はまだ 'playing'（match_end 発火時に 'finished' へ落とす）。
	 */
	private finishStarted = false;
	private readonly opts: Required<Pick<RoomOptions, 'now' | 'log'>> & RoomOptions;

	private constructor(options: RoomOptions) {
		this.roomId = options.roomId;
		this.mode = options.mode;
		this.opts = { ...options, now: options.now ?? Date.now, log: options.log ?? consoleLogger };
		this.stateEnteredAt = this.opts.now();
		const seats = seatCount(options.mode);
		const assertValidSlot = (slot: number, source: string): void => {
			if (!Number.isInteger(slot) || slot < 0 || slot >= seats) {
				throw new Error(`${source} の slot ${slot} は ${options.mode} の定員 ${seats} の外`);
			}
		};
		if (options.participants?.length === 0) {
			throw new Error('participants を指定する場合は1人以上必要');
		}
		for (const p of options.participants ?? []) {
			assertValidSlot(p.slot, `participant userId=${p.userId}`);
		}
		for (const slot of options.humanSlots ?? []) {
			assertValidSlot(slot, 'humanSlots');
		}
		for (const p of options.participants ?? []) {
			if (this.participantSlots.has(p.userId)) {
				throw new Error(`participant userId=${p.userId} が重複している`);
			}
			if ([...this.participantSlots.values()].includes(p.slot)) {
				throw new Error(`participant slot=${p.slot} が重複している`);
			}
			this.participantSlots.set(p.userId, p.slot);
		}
		// 優先順: humanSlots → participants から導出 → 全席が人間
		// （定員ちょうど埋まったクイックマッチは最後の扱いで正しい）
		this.expectedHumanSlots = new Set(
			options.humanSlots ??
				(options.participants
					? options.participants.map((p) => p.slot)
					: Array.from({ length: seatCount(options.mode) }, (_, i) => i)),
		);
		const playerSlots =
			options.participants?.map((participant) => participant.slot) ??
			[...this.expectedHumanSlots];
		for (const slot of playerSlots) {
			this.playerSeats.set(slot, {
				state: 'ai',
				graceUntil: null,
				abandoned: false,
			});
		}
		if (options.onBroadcast) this.listeners.add(options.onBroadcast);
	}

	/**
	 * ② §5-A の `join` 用。Cookie から得た userId に対応する slot を返す。
	 * participant でなければ `undefined`（呼び出し側は close 4003）。
	 */
	getSlotForUser(userId: number): number | undefined {
		return this.participantSlots.get(userId);
	}

	/**
	 * 配信を購読する。戻り値を呼ぶと解除。
	 *
	 * B-11 は**ルームにつき1回**購読し、そこから接続集合へファンアウトする。
	 * 接続ごとに購読すると ② §5-B の「同一シリアライズ済み文字列を配信」が
	 * 崩れる（接続数ぶん stringify してしまう）。
	 */
	subscribe(listener: BroadcastListener): () => void {
		this.listeners.add(listener);
		return () => this.listeners.delete(listener);
	}

	/** B-11 が welcome（② §5-B）を組み立てるための情報 */
	describe(): RoomDescription {
		return {
			mode: this.mode,
			mapText: this.opts.cubText,
			rules: { target_score: this.opts.targetScore },
			tick_rate: TICK_HZ,
			snap_rate: SNAP_HZ,
			interp_ms: INTERP_MS,
			state: this.state,
		};
	}

	static async create(options: RoomOptions): Promise<GameRoom> {
		const room = new GameRoom(options);
		room.sim = await SimGame.create({
			cubText: options.cubText,
			mode: options.mode,
			targetScore: options.targetScore,
			seed: options.seed,
		});
		// ② §6-B: 全席をまず AI で作る。人間が来たら入力源だけ EXTERNAL へ切り替える。
		// これで接続タイミングに関係なく試合が成立する（B-12 の AI 代替も同じ仕組み）
		for (let slot = 0; slot < seatCount(options.mode); slot++) {
			room.sim.addCombatant(slot, true);
			room.inputs.set(slot, { ...NEUTRAL_INPUT });
		}
		return room;
	}

	getState(): RoomState {
		return this.state;
	}

	getTick(): number {
		return this.tick;
	}

	getHumanSeatCount(): number {
		return this.humanSeats.size;
	}

	/** HUDと検査向けにparticipant席の現在状態を返す */
	getPlayerSeatState(slot: number): PlayerSeatState | undefined {
		return this.playerSeats.get(slot)?.state;
	}

	/** 新規・再接続clientへ現在の全participant席状態を渡す */
	getPlayerSeatStates(): ReadonlyArray<{ slot: number; state: PlayerSeatState }> {
		return [...this.playerSeats]
			.map(([slot, seat]) => ({ slot, state: seat.state }))
			.sort((a, b) => a.slot - b.slot);
	}

	/** grace満了または明示leaveで復帰不能になったparticipant席一覧を返す */
	getAbandonedSlots(): number[] {
		return [...this.playerSeats]
			.filter(([, seat]) => seat.abandoned)
			.map(([slot]) => slot)
			.sort((a, b) => a - b);
	}

	/**
	 * 人間が席に着く。B-11 の join、B-12 の再接続から呼ぶ。
	 *
	 * ② §4-C: created の間に**予定していた人間席が全部埋まれば**、10 秒を待たず
	 * カウントダウンへ進む。判定に使うのは `humanSlots`（② §6-A 追補）で、
	 * 「定員ぶんの人間」ではない。
	 *
	 * GameRoom 自体は participant の本人確認を行わず、定員内 slot だけを受け付ける。
	 * game WS gateway が `getSlotForUser()` で認可してから本メソッドを呼ぶ。
	 * `humanSlots` は早期 countdown 判定専用であり、認可表として使わない。
	 */
	join(slot: number): RoomJoinResult {
		if (
			this.finishStarted ||
			(this.state !== 'created' && this.state !== 'countdown' && this.state !== 'playing')
		) {
			throw new Error(`join は ${this.state} では受け付けない`);
		}
		if (!Number.isInteger(slot) || slot < 0 || slot >= seatCount(this.mode)) {
			// B-11 は外部メッセージから slot を決めるので、ここで必ず弾く
			throw new Error(`slot ${slot} は ${this.mode} の定員 ${seatCount(this.mode)} の外`);
		}
		const playerSeat = this.playerSeats.get(slot);
		if (!playerSeat) throw new Error(`slot ${slot} はparticipant席ではない`);
		if (
			playerSeat.state === 'grace' &&
			playerSeat.graceUntil !== null &&
			playerSeat.graceUntil <= this.opts.now()
		) {
			this.abandonSeat(slot);
		}
		if (playerSeat.abandoned) {
			throw new Error(`slot ${slot} はgrace満了後のためplayer復帰できない`);
		}
		if (this.state === 'playing' && playerSeat.state === 'ai') {
			throw new Error(`slot ${slot} は開始前に未接続だったためplayer参加できない`);
		}
		const resume = playerSeat.state === 'grace';
		const changed = playerSeat.state !== 'connected';
		playerSeat.state = 'connected';
		playerSeat.graceUntil = null;
		this.requireSim();
		this.setSeatInputSource(slot, INPUT_SRC_EXTERNAL);
		if (changed) this.broadcastPlayerStatus(slot, 'connected');
		if (resume) {
			this.broadcast({ t: 'event', d: { kind: 'player_reconnected', slot } });
		}
		if (this.state === 'created' && this.allExpectedHumansJoined()) {
			this.enterCountdown('countdown_ready');
		}
		return { resume };
	}

	/** 予定していた人間席が全部 join 済みか（② §4-C の早期開始条件） */
	private allExpectedHumansJoined(): boolean {
		for (const slot of this.expectedHumanSlots) {
			if (!this.humanSeats.has(slot)) return false;
		}
		return true;
	}

	/** 通常切断。即AI代替し、30秒のplayer復帰猶予へ入れる */
	disconnect(slot: number): void {
		const playerSeat = this.playerSeats.get(slot);
		if (
			!playerSeat ||
			playerSeat.state !== 'connected' ||
			this.finishStarted ||
			this.state === 'finished' ||
			this.state === 'closed'
		) {
			return;
		}
		this.setSeatInputSource(slot, INPUT_SRC_AI);
		playerSeat.state = 'grace';
		playerSeat.graceUntil = this.opts.now() + PLAYER_RECONNECT_GRACE_MS;
		this.broadcastPlayerStatus(slot, 'grace');
		this.broadcast({
			t: 'event',
			d: { kind: 'player_disconnected', slot, grace_ms: PLAYER_RECONNECT_GRACE_MS },
		});
	}

	/** 明示leave。猶予なしで復帰不能のAI席へ移し、FPSなら即forfeitにする */
	leave(slot: number): void {
		this.abandonSeat(slot);
	}

	/** 再接続welcome直後へ送る、その時点の全量snapshotを1回だけserializeする */
	getResumeSnapshot(): { message: SnapshotMessage; serialized: string } | null {
		if (!this.sim || this.state !== 'playing') return null;
		const message = decodeSnapshot(this.sim.readSnapshot(), this.tick, this.mode);
		return { message, serialized: JSON.stringify(message) };
	}

	/** B-11 が受信した input を席バッファへ。反映は次の tick（② §6-B） */
	setInput(slot: number, input: SeatInput): void {
		if (this.state !== 'playing') return;
		if (!this.humanSeats.has(slot)) return;
		this.inputs.set(slot, input);
	}

	/** created から時間切れ・カウントダウン満了を進める。tick ループ外の時間経過を処理する */
	pump(): void {
		this.expireGraceSeats();
		const elapsed = this.opts.now() - this.stateEnteredAt;
		if (this.state === 'created' && elapsed >= JOIN_GRACE_MS) {
			if (this.humanSeats.size === 0) {
				// 誰も来なかったルームは記録を残さず破棄（② §6-A）
				this.opts.log.info({ room: this.roomId }, 'GameRoom: 人間0人のまま時間切れ → closed');
				this.close('no_humans');
			} else {
				this.enterCountdown('countdown_timeout');
			}
		} else if (this.state === 'countdown' && elapsed >= COUNTDOWN_MS) {
			this.enterPlaying();
		} else if (this.state === 'finished' && elapsed >= FINISHED_HOLD_MS) {
			this.close('finished_hold');
		}
	}

	/** 明示的に開始する（マッチメイキング側が全員そろったと判断した場合など） */
	startNow(): void {
		if (this.state === 'created') this.enterCountdown('countdown_ready');
	}

	/** simとtick timerを冪等に破棄し、closed lifecycleを通知する */
	close(reason: RoomLifecycleReason = 'discarded'): void {
		if (this.state === 'closed') return;
		this.stopTimer();
		this.sim?.destroy();
		this.sim = null;
		for (const seat of this.playerSeats.values()) seat.graceUntil = null;
		this.setState('closed', reason);
	}

	private enterCountdown(reason: 'countdown_ready' | 'countdown_timeout' = 'countdown_ready'): void {
		this.setState('countdown', reason);
		this.broadcast({ t: 'event', d: { kind: 'countdown', seconds: COUNTDOWN_MS / 1000 } });
	}

	private enterPlaying(): void {
		this.setState('playing', 'match_started');
		this.broadcast({ t: 'event', d: { kind: 'match_start' } });
		// 30Hz の唯一の正（② §6-A）。unref しないのは、走っている試合が
		// プロセスを延命すべきだから（サーバとしては正しい挙動）
		this.timer = setInterval(() => this.onTick(), TICK_MS);
	}

	private onTick(): void {
		const startedAt = this.opts.now();
		const sim = this.sim;
		if (!sim || this.state !== 'playing') return;

		for (const [slot, input] of this.inputs) {
			if (this.humanSeats.has(slot)) sim.setInput(slot, input);
		}

		const finished = sim.step(1 / TICK_HZ);
		this.tick++;

		// ② §6-A: 偶数 tick のみ配信（実効 15Hz）
		const broadcastedThisTick = this.tick % 2 === 0;
		if (broadcastedThisTick) {
			const message = decodeSnapshot(sim.readSnapshot(), this.tick, this.mode);
			this.broadcast(message);
			// snapshot を配ってからイベントを出す（値の正本が先に届く。② §5-D）
			for (const event of diffEvents(this.previous, message.d, this.mode)) {
				this.broadcast(event);
			}
			this.previous = message.d;
		}
		if (finished) {
			// 偶数 tick で決着した場合、直上で最終 snapshot を配信済み。
			// finish() 側で二重に送らないよう伝える
			this.finish('decided', broadcastedThisTick);
			return;
		}
		this.warnIfOverrun(startedAt);
	}

	/**
	 * ⑤ B-10 の受入条件「tick 過負荷警告ログ」。
	 * 1 tick の処理が 33ms を超え始めたら、ルーム数か sim が限界に近い。
	 */
	private warnIfOverrun(startedAt: number): void {
		const elapsed = this.opts.now() - startedAt;
		if (elapsed < TICK_OVERRUN_MS) return;
		const now = this.opts.now();
		if (now - this.lastOverrunLogAt < OVERRUN_LOG_INTERVAL_MS) return;
		this.lastOverrunLogAt = now;
		this.opts.log.warn(
			{ room: this.roomId, tick: this.tick, elapsed_ms: elapsed, budget_ms: TICK_OVERRUN_MS },
			'GameRoom: tick が予算を超過（ルーム数か負荷を確認）',
		);
	}

	/**
	 * @param outcome decided = sim決着 / abandon = 全員離脱 / forfeit = FPS離脱負け
	 * @param alreadyBroadcasted 同じ tick で最終 snapshot を配信済みか
	 *
	 * ② §6-C の同期部分（1. 最終 snapshot 配信）だけをここで行う。
	 * 永続化（2.）と `event(match_end)` 発火（3.）は
	 * {@link persistAndAnnounceEnd} が async で実施する。
	 *
	 * abandon では **snapshot を追加配信しない**。sim はまだ playing なので、
	 * ここで state=finished の snapshot を作ると ② §5-C の「match.state は sim の
	 * enum そのまま」に反する。クライアントは match_end イベントで終了を知る。
	 */
	private finish(
		outcome: 'decided' | 'abandon' | 'forfeit',
		alreadyBroadcasted = false,
		forfeitWinner?: number,
	): void {
		if (this.finishStarted) return; // 二重起動防止（onTick と leave の両方から来うる）
		this.finishStarted = true;
		this.stopTimer();
		const sim = this.requireSim();
		// 決着後の game_step は状態を進めず 1 を返し続ける（申し送り 6）。
		// 最終 snapshot を1回だけ配信してから永続化フェーズへ入る（② §6-C 1.）
		const last = decodeSnapshot(sim.readSnapshot(), this.tick, this.mode);
		if (outcome === 'decided' && !alreadyBroadcasted) {
			this.broadcast(last);
			for (const event of diffEvents(this.previous, last.d, this.mode)) {
				this.broadcast(event);
			}
			this.previous = last.d;
		}
		const winner =
			outcome === 'abandon'
				? null
				: outcome === 'forfeit'
					? (forfeitWinner ?? null)
					: last.d.match.winner;
		// ② §5-D: reason は score|goal|forfeit|abandon。forfeit は B-12（leave / 猶予満了）で使う
		const reason: MatchEndReason =
			outcome === 'abandon'
				? 'abandon'
				: outcome === 'forfeit'
					? 'forfeit'
					: this.mode === 'fps'
						? 'goal'
						: 'score';
		// state は 'playing' のまま持ち越し（タイマー停止済み・入力反映も stopTimer で
		// 次 tick が来ないので実質固まる）。await 完了後に 'finished' へ落とす。
		void this.persistAndAnnounceEnd(winner, reason, [last.d.match.score[0], last.d.match.score[1]]);
	}

	/**
	 * ② §6-C の 2. 永続化 → 3. `event(match_end)` 発火 → 60 秒保持の起点。
	 *
	 * **永続化と発火の順序を逆にしない**（②§6-C の改訂 2026-07-29）。
	 * 逆にすると FE の結果画面が match_id を非同期に受け取る前提で書けなくなる。
	 *
	 * 永続化未提供（B-13 未実装）・例外・null 戻り値のいずれも `match_id: null` へ
	 * フォールバック（② §5-D）。DB行が無いため `match_result` は送らず、
	 * クライアントは最終 snapshot の勝敗・スコアだけで結果画面を表示する。
	 */
	private async persistAndAnnounceEnd(
		winner: number | null,
		reason: MatchEndReason,
		score: readonly [number, number],
	): Promise<void> {
		let matchId: number | null = null;
		let matchResult: MatchResultPayload | null = null;
		if (this.opts.persistMatch) {
			try {
				const persisted = await this.opts.persistMatch({
					roomId: this.roomId,
					mode: this.mode,
					winner,
					reason,
					score,
					tick: this.tick,
					abandonedSlots: this.disconnectedParticipantSlots(),
				});
				if (persisted) {
					if (
						!Number.isInteger(persisted.matchId) ||
						persisted.matchId <= 0 ||
						persisted.result.match_id !== persisted.matchId
					) {
						throw new Error('persistMatch の matchId と result.match_id が一致しない');
					}
					matchId = persisted.matchId;
					matchResult = persisted.result;
				}
			} catch (err) {
				this.opts.log.warn(
					{ room: this.roomId, err },
					'GameRoom: persistMatch が失敗（match_end は match_id=null。最終 snapshot を結果表示に使う）',
				);
			}
		}
		this.broadcast({
			t: 'event',
			d: { kind: 'match_end', winner, reason, match_id: matchId },
		});
		if (matchResult && this.opts.onMatchResult) {
			try {
				this.opts.onMatchResult(matchResult);
			} catch (err) {
				this.opts.log.warn(
					{ room: this.roomId, match_id: matchId, err },
					'GameRoom: onMatchResult の通知に失敗',
				);
			}
		}
		// ② §6-C 5. の 60 秒保持は match_end 発火時点から数える（永続化に時間が
		// かかった場合の切れ端を避ける）。setState が stateEnteredAt を更新する
		this.setState('finished', 'match_end');
		this.opts.log.info(
			{ room: this.roomId, tick: this.tick, reason, winner, score, match_id: matchId },
			'GameRoom: 試合終了',
		);
		// ② §6-C 4. の lobby WS 配信は onMatchResult の接続先（B-09/B-13）の責務
	}

	private setState(next: RoomState, reason: RoomLifecycleReason): void {
		this.state = next;
		this.stateEnteredAt = this.opts.now();
		try {
			this.opts.onLifecycle?.(next, reason);
		} catch (err) {
			this.opts.log.warn(
				{ room: this.roomId, state: next, reason, err },
				'GameRoom: onLifecycle の通知に失敗',
			);
		}
	}

	private stopTimer(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	/** grace期限へ到達した席をAI確定し、mode別の終了条件を評価する */
	private expireGraceSeats(): void {
		if (this.state === 'finished' || this.state === 'closed') return;
		const now = this.opts.now();
		for (const [slot, seat] of this.playerSeats) {
			if (
				seat.state === 'grace' &&
				seat.graceUntil !== null &&
				seat.graceUntil <= now
			) {
				this.abandonSeat(slot);
				if (this.finishStarted) return;
			}
		}
	}

	/** participant席を復帰不能なAIへ確定し、forfeit/全員abandonを必要なら開始する */
	private abandonSeat(slot: number): void {
		const seat = this.playerSeats.get(slot);
		if (
			!seat ||
			seat.abandoned ||
			this.finishStarted ||
			this.state === 'finished' ||
			this.state === 'closed'
		) {
			return;
		}
		this.setSeatInputSource(slot, INPUT_SRC_AI);
		seat.state = 'ai';
		seat.graceUntil = null;
		seat.abandoned = true;
		this.broadcastPlayerStatus(slot, 'ai');
		this.broadcast({ t: 'event', d: { kind: 'ai_takeover', slot } });
		if (this.state !== 'playing' && this.state !== 'countdown') return;
		if (this.mode === 'fps') {
			const winner = slot === 0 ? 1 : 0;
			this.finish('forfeit', false, winner);
		} else if ([...this.playerSeats.values()].every((playerSeat) => playerSeat.abandoned)) {
			this.finish('abandon');
		}
	}

	/** sim入力源とconnected席集合を同じ操作で更新する */
	private setSeatInputSource(slot: number, source: number): void {
		if (!this.sim) return;
		this.sim.setInputSource(slot, source);
		if (source === INPUT_SRC_EXTERNAL) this.humanSeats.add(slot);
		else this.humanSeats.delete(slot);
		this.inputs.set(slot, { ...NEUTRAL_INPUT });
	}

	/** 席状態の正本を全接続へ1回だけserializeして配信する */
	private broadcastPlayerStatus(slot: number, state: PlayerSeatState): void {
		this.broadcast({ t: 'player_status', d: { slot, state } });
	}

	/** 決着時点でconnectedでないparticipant席をB-13永続化用に返す */
	private disconnectedParticipantSlots(): number[] {
		return [...this.playerSeats]
			.filter(([, seat]) => seat.state !== 'connected')
			.map(([slot]) => slot)
			.sort((a, b) => a - b);
	}

	private broadcast(message: RoomMessage): void {
		if (this.listeners.size === 0) return;
		// ② §5-B: 1回だけ直列化して同じ文字列を全員へ
		const serialized = JSON.stringify(message);
		for (const listener of this.listeners) listener(message, serialized);
	}

	private requireSim(): SimGame {
		if (!this.sim) throw new Error(`room ${this.roomId} は closed`);
		return this.sim;
	}
}
