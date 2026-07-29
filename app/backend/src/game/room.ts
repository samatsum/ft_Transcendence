// W-10: GameRoom 本体。1試合 = 1ルーム = 1つの t_game（② §6）。
//
// 状態機械の正本は 2-WSプロトコル設計「6-A. 状態機械」:
//   created ──全人間join or 10s──► countdown(3s) ──► playing ──決着──► finished ──60s──► closed
//      └── 人間0人のまま10s ──► closed（記録なし）
//
// 本ファイルは **WS を知らない**。配信は onBroadcast コールバック経由で、
// W-11 がそこへ WebSocket.send を差し込む。
import { diffEvents } from './events.js';
import { SimGame, INPUT_SRC_AI, INPUT_SRC_EXTERNAL, NEUTRAL_INPUT, type SeatInput } from './sim.js';
import type { GameEvent, MatchEndReason } from '@ft/shared';
import { decodeSnapshot, type SnapshotMessage, type SnapshotPayload } from './snapshot.js';

export type RoomState = 'created' | 'countdown' | 'playing' | 'finished' | 'closed';

// ② §5-D のイベントと match_end.reason は `@ft/shared` の ws/game.ts が正本
// （Issue #10 で配置を合意）。F-06/F-07 が同じ定義を import するので、
// ここで再定義せず re-export する。
export type { MatchEndReason } from '@ft/shared';

/** ルーム層が配信するイベント（② §5-D）。W-11 が WS メッセージとして流す */
export type RoomEvent = GameEvent;

/** ② §5-B の welcome を W-11 が組み立てるために必要な、ルームが持つ情報 */
export interface RoomDescription {
	mode: 'rsp' | 'fps';
	/** welcome.map_text。サーバがロードした .cub をそのまま配る（② §5-B の単一情報源） */
	mapText: string;
	rules: { target_score: number };
	tick_rate: number;
	snap_rate: number;
	interp_ms: number;
	state: RoomState;
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
	/**
	 * 人間が座る予定の席（② §6-A の追補）。マッチメイキング（W-09）が渡す。
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
	 * 全参加者へ配信する。W-11 が WS へ差し替える。
	 *
	 * `serialized` は **ルーム内で1回だけ `JSON.stringify` した文字列**。
	 * ② §5-B が「全参加者+観戦者に同一シリアライズ済み文字列を配信
	 * （クライアント別加工なし）」と定めているので、接続ごとに stringify しない。
	 * オブジェクト側はテストと将来の分岐用。
	 */
	onBroadcast?: (message: SnapshotMessage | RoomEvent, serialized: string) => void;
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
	/** 人間が座る予定の席（② §6-A 追補）。early start の判定に使う */
	private readonly expectedHumanSlots: Set<number>;

	private lastOverrunLogAt = 0;
	/** 直前に配信した snapshot。差分から point_scored / hand_changed / goal を起こす */
	private previous: SnapshotPayload | null = null;
	private readonly opts: Required<Pick<RoomOptions, 'now' | 'log'>> & RoomOptions;

	private constructor(options: RoomOptions) {
		this.roomId = options.roomId;
		this.mode = options.mode;
		this.opts = { ...options, now: options.now ?? Date.now, log: options.log ?? consoleLogger };
		this.stateEnteredAt = this.opts.now();
		// 省略時は全席が人間（定員ちょうど埋まったクイックマッチと同じ扱い）
		const seats = seatCount(options.mode);
		if (options.humanSlots) {
			for (const s of options.humanSlots) {
				if (!Number.isInteger(s) || s < 0 || s >= seats) {
					throw new Error(`humanSlots の ${s} は ${options.mode} の定員 ${seats} の外`);
				}
			}
		}
		this.expectedHumanSlots = new Set(
			options.humanSlots ?? Array.from({ length: seats }, (_, i) => i),
		);
	}

	/** W-11 が welcome（② §5-B）を組み立てるための情報 */
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
	 *
	 * ② §4-C: created の間に**予定していた人間席が全部埋まれば**、10 秒を待たず
	 * カウントダウンへ進む。判定に使うのは `humanSlots`（② §6-A 追補）で、
	 * 「定員ぶんの人間」ではない。
	 *
	 * 一覧外の slot からの join も受理する（AI 席を人間が取る / W-12 の再接続）。
	 * ただし**定員外の slot は拒否**する（② §2-B の close 4003 に対応）。
	 */
	join(slot: number): void {
		if (this.state !== 'created' && this.state !== 'countdown' && this.state !== 'playing') {
			throw new Error(`join は ${this.state} では受け付けない`);
		}
		if (!Number.isInteger(slot) || slot < 0 || slot >= seatCount(this.mode)) {
			// W-11 は外部メッセージから slot を決めるので、ここで必ず弾く
			throw new Error(`slot ${slot} は ${this.mode} の定員 ${seatCount(this.mode)} の外`);
		}
		this.requireSim().setInputSource(slot, INPUT_SRC_EXTERNAL);
		this.humanSeats.add(slot);
		this.inputs.set(slot, { ...NEUTRAL_INPUT });
		if (this.state === 'created' && this.allExpectedHumansJoined()) {
			this.enterCountdown();
		}
	}

	/** 予定していた人間席が全部 join 済みか（② §4-C の早期開始条件） */
	private allExpectedHumansJoined(): boolean {
		for (const slot of this.expectedHumanSlots) {
			if (!this.humanSeats.has(slot)) return false;
		}
		return true;
	}

	/**
	 * 席を AI に戻す。猶予つきの切断処理（W-12）は上位が持ち、ここは即時の付け替えだけ。
	 * closed 後にも呼ばれうる（WS の close が遅れて届く）ので、その場合は何もしない。
	 */
	leave(slot: number): void {
		if (!this.humanSeats.delete(slot)) return;
		if (!this.sim) return;
		this.sim.setInputSource(slot, INPUT_SRC_AI);
		this.inputs.set(slot, { ...NEUTRAL_INPUT });
		// 全人間が抜けたら試合を続ける意味がない（② §6-A の abandon）
		if (this.state === 'playing' && this.humanSeats.size === 0) {
			this.opts.log.info({ room: this.roomId }, 'GameRoom: 人間が0人になったので abandon');
			this.finish('abandon');
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
		const broadcastedThisTick = this.tick % 2 === 0;
		if (broadcastedThisTick) {
			const message = decodeSnapshot(sim.readSnapshot(), this.tick);
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

	/**
	 * @param reason decided = sim が決着を報告 / abandon = 人間が全員抜けた（② §6-A）
	 * @param alreadyBroadcasted 同じ tick で最終 snapshot を配信済みか
	 *
	 * abandon では **snapshot を追加配信しない**。sim はまだ playing なので、
	 * ここで state=finished の snapshot を作ると ② §5-C の「match.state は sim の
	 * enum そのまま」に反する。クライアントは match_end イベントで終了を知る。
	 */
	private finish(outcome: 'decided' | 'abandon', alreadyBroadcasted = false): void {
		this.stopTimer();
		const sim = this.requireSim();
		// 決着後の game_step は状態を進めず 1 を返し続ける（申し送り 6）。
		// 最終 snapshot を1回だけ配信してから finished に落とす（② §6-C の 1.）
		const last = decodeSnapshot(sim.readSnapshot(), this.tick);
		if (outcome === 'decided' && !alreadyBroadcasted) {
			this.broadcast(last);
			for (const event of diffEvents(this.previous, last.d, this.mode)) {
				this.broadcast(event);
			}
			this.previous = last.d;
		}
		const winner = outcome === 'abandon' ? null : last.d.match.winner;
		// ② §5-D: reason は score|goal|forfeit|abandon。forfeit は W-12（leave / 猶予満了）で使う
		const reason: MatchEndReason =
			outcome === 'abandon' ? 'abandon' : this.mode === 'fps' ? 'goal' : 'score';
		this.broadcast({
			t: 'event',
			// match_id は W-13 の永続化が採番する。W-11 時点では null で、
			// 結果画面は snapshot の score/winner で描ける（② §5-D の「正本は snapshot」）
			d: { kind: 'match_end', winner, reason, match_id: null },
		});
		this.setState('finished');
		this.opts.log.info(
			{ room: this.roomId, tick: this.tick, reason, winner, score: last.d.match.score },
			'GameRoom: 試合終了',
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
		if (!this.opts.onBroadcast) return;
		// ② §5-B: 1回だけ直列化して同じ文字列を全員へ
		this.opts.onBroadcast(message, JSON.stringify(message));
	}

	private requireSim(): SimGame {
		if (!this.sim) throw new Error(`room ${this.roomId} は closed`);
		return this.sim;
	}
}
