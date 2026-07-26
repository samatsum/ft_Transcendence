// W-10: GameRoom 本体。1試合 = 1ルーム = 1つの t_game（② §6）。
//
// 状態機械の正本は 2-WSプロトコル設計「6-A. 状態機械」:
//   created ──全人間join or 10s──► countdown(3s) ──► playing ──決着──► finished ──60s──► closed
//      └── 人間0人のまま10s ──► closed（記録なし）
//
// 本ファイルは **WS を知らない**。配信は onBroadcast コールバック経由で、
// W-11 がそこへ WebSocket.send を差し込む。
import { SimGame, INPUT_SRC_AI, INPUT_SRC_EXTERNAL, NEUTRAL_INPUT, type SeatInput } from './sim.js';
import { decodeSnapshot, type SnapshotMessage } from './snapshot.js';

export type RoomState = 'created' | 'countdown' | 'playing' | 'finished' | 'closed';

/** ルーム層のイベント（② §5-D）。W-11 が WS メッセージとして流す */
export type RoomEvent =
	| { t: 'event'; d: { kind: 'countdown'; seconds: number } }
	| { t: 'event'; d: { kind: 'match_start' } }
	| { t: 'event'; d: { kind: 'match_end'; winner: number | null; score: [number, number] } };

export const TICK_HZ = 30;
const TICK_MS = 1000 / TICK_HZ;
/** created で人間を待つ上限（② §6-A） */
const JOIN_GRACE_MS = 10_000;
const COUNTDOWN_MS = 3_000;
/** finished で結果画面のため接続を維持する時間（② §6-A） */
const FINISHED_HOLD_MS = 60_000;
/** 1 tick の処理がこれを超えたら過負荷とみなして警告（⑤ W-10 受入条件） */
const TICK_OVERRUN_MS = TICK_MS;
/** 同じ警告でログを溢れさせないための間引き */
const OVERRUN_LOG_INTERVAL_MS = 1_000;

export interface RoomOptions {
	roomId: string;
	/** .cub の中身。マップ ID からの解決は W-14 の責務 */
	cubText: string;
	mode: 'rsp' | 'fps';
	targetScore: number;
	seed: number;
	/** 全参加者へ配信する。W-11 が WS へ差し替える */
	onBroadcast?: (message: SnapshotMessage | RoomEvent) => void;
	/** 差し替え可能にしておくとテストで時間を進められる */
	now?: () => number;
	log?: RoomLogger;
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
export function seatCount(mode: 'rsp' | 'fps'): number {
	return mode === 'rsp' ? 4 : 2;
}

export class GameRoom {
	readonly roomId: string;
	readonly mode: 'rsp' | 'fps';

	private sim: SimGame | null = null;
	private state: RoomState = 'created';
	private tick = 0;
	private timer: NodeJS.Timeout | null = null;
	private stateEnteredAt = 0;

	/** 席ごとの最新入力。毎 tick これを sim へ流し込む（② §6-B） */
	private readonly inputs = new Map<number, SeatInput>();
	/** 人間が座っている席。空なら実質 AI 同士の試合 */
	private readonly humanSeats = new Set<number>();

	private lastOverrunLogAt = 0;
	private readonly opts: Required<Pick<RoomOptions, 'now' | 'log'>> & RoomOptions;

	private constructor(options: RoomOptions) {
		this.roomId = options.roomId;
		this.mode = options.mode;
		this.opts = { ...options, now: options.now ?? Date.now, log: options.log ?? consoleLogger };
		this.stateEnteredAt = this.opts.now();
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
		// これで接続タイミングに関係なく試合が成立する（W-12 の AI 代替も同じ仕組み）
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

	/**
	 * 人間が席に着く。W-11 の join、W-12 の再接続から呼ぶ。
	 * created の間に全席が埋まればカウントダウンへ進む。
	 */
	join(slot: number): void {
		if (this.state !== 'created' && this.state !== 'countdown' && this.state !== 'playing') {
			throw new Error(`join は ${this.state} では受け付けない`);
		}
		this.requireSim().setInputSource(slot, INPUT_SRC_EXTERNAL);
		this.humanSeats.add(slot);
		this.inputs.set(slot, { ...NEUTRAL_INPUT });
		if (this.state === 'created' && this.humanSeats.size >= seatCount(this.mode)) {
			this.enterCountdown();
		}
	}

	/** 席を AI に戻す。猶予つきの切断処理（W-12）は上位が持ち、ここは即時の付け替えだけ */
	leave(slot: number): void {
		if (!this.humanSeats.delete(slot)) return;
		this.requireSim().setInputSource(slot, INPUT_SRC_AI);
		this.inputs.set(slot, { ...NEUTRAL_INPUT });
		// 全人間が抜けたら試合を続ける意味がない（② §6-A の abandon）
		if (this.state === 'playing' && this.humanSeats.size === 0) {
			this.opts.log.info({ room: this.roomId }, 'GameRoom: 人間が0人になったので abandon');
			this.finish();
		}
	}

	/** W-11 が受信した input を席バッファへ。反映は次の tick（② §6-B） */
	setInput(slot: number, input: SeatInput): void {
		if (this.state !== 'playing') return;
		if (!this.humanSeats.has(slot)) return;
		this.inputs.set(slot, input);
	}

	/** created から時間切れ・カウントダウン満了を進める。tick ループ外の時間経過を処理する */
	pump(): void {
		const elapsed = this.opts.now() - this.stateEnteredAt;
		if (this.state === 'created' && elapsed >= JOIN_GRACE_MS) {
			if (this.humanSeats.size === 0) {
				// 誰も来なかったルームは記録を残さず破棄（② §6-A）
				this.opts.log.info({ room: this.roomId }, 'GameRoom: 人間0人のまま時間切れ → closed');
				this.close();
			} else {
				this.enterCountdown();
			}
		} else if (this.state === 'countdown' && elapsed >= COUNTDOWN_MS) {
			this.enterPlaying();
		} else if (this.state === 'finished' && elapsed >= FINISHED_HOLD_MS) {
			this.close();
		}
	}

	/** 明示的に開始する（マッチメイキング側が全員そろったと判断した場合など） */
	startNow(): void {
		if (this.state === 'created') this.enterCountdown();
	}

	close(): void {
		if (this.state === 'closed') return;
		this.stopTimer();
		this.sim?.destroy();
		this.sim = null;
		this.setState('closed');
	}

	private enterCountdown(): void {
		this.setState('countdown');
		this.broadcast({ t: 'event', d: { kind: 'countdown', seconds: COUNTDOWN_MS / 1000 } });
	}

	private enterPlaying(): void {
		this.setState('playing');
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
		if (this.tick % 2 === 0) {
			this.broadcast(decodeSnapshot(sim.readSnapshot(), this.tick));
		}
		if (finished) {
			this.finish();
			return;
		}
		this.warnIfOverrun(startedAt);
	}

	/**
	 * ⑤ W-10 の受入条件「tick 過負荷警告ログ」。
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

	private finish(): void {
		this.stopTimer();
		const sim = this.requireSim();
		// 決着後の game_step は状態を進めず 1 を返し続ける（申し送り 6）。
		// 最終 snapshot を1回だけ配信してから finished に落とす（② §6-C の 1.）
		const last = decodeSnapshot(sim.readSnapshot(), this.tick);
		this.broadcast(last);
		this.broadcast({
			t: 'event',
			d: { kind: 'match_end', winner: last.d.match.winner, score: last.d.match.score },
		});
		this.setState('finished');
		this.opts.log.info(
			{ room: this.roomId, tick: this.tick, winner: last.d.match.winner, score: last.d.match.score },
			'GameRoom: 決着',
		);
		// W-13 連携: ここで torinoue 側の永続化へ渡す（② §6-C の 2.）
	}

	private setState(next: RoomState): void {
		this.state = next;
		this.stateEnteredAt = this.opts.now();
	}

	private stopTimer(): void {
		if (this.timer) {
			clearInterval(this.timer);
			this.timer = null;
		}
	}

	private broadcast(message: SnapshotMessage | RoomEvent): void {
		this.opts.onBroadcast?.(message);
	}

	private requireSim(): SimGame {
		if (!this.sim) throw new Error(`room ${this.roomId} は closed`);
		return this.sim;
	}
}
