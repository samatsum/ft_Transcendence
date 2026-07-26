// W-10: フラット f64 の snapshot を ② §5-C の JSON へ変換する。
//
// **ここが hminemur（F-06）との契約の実体**。配信形を変えるときは
// 2-WSプロトコル設計「5-C. snapshot ペイロード」を先に改訂すること（⑥ §7-3）。
// レイアウトの正本は codes/includes/platform/sim.h。
//
// 参照実装は web/sim_demo/record.mjs の takeSnapshot()。この関数は wasm に
// 触らない純関数なので、Float64Array を作れば単体テストできる。

/** sim.h の SIM_SNAP_HEADER_DOUBLES */
const HEADER_DOUBLES = 5;
/** sim.h の SIM_SNAP_COMBATANT_DOUBLES: [id,team,hand,x,y,dir,alive,is_ai,respawn_s] */
const COMBATANT_DOUBLES = 9;

/** sim.h の SIM_STATE_*。countdown は sim ではなくルーム層の event で表現する */
const STATE_NAME: Record<number, MatchState> = {
	1: 'playing',
	2: 'finished',
};

export type MatchState = 'waiting' | 'playing' | 'finished';

export interface CombatantView {
	/** 席 id。**配列の並び順とは無関係**なので必ずこれで照合する（申し送り 4） */
	id: number;
	team: number;
	/** じゃんけんの手 0/1/2。サーバが決める値（D-17 で input からは削除済み） */
	hand: number;
	pos: [number, number];
	dir: number;
	alive: boolean;
	is_ai: boolean;
	respawn_ms: number;
}

export interface SnapshotPayload {
	tick: number;
	match: {
		state: MatchState;
		/** RSP = チーム番号 / FPS = combatant_id / 未決着 = null */
		winner: number | null;
		score: [number, number];
	};
	combatants: CombatantView[];
}

/** WS の共通エンベロープ（② §2-A）。この形のまま send() する */
export interface SnapshotMessage {
	t: 'snapshot';
	d: SnapshotPayload;
}

/** 座標・角度の丸め桁。これで 1 件 ≒ 520B に収まり ② §8 の 1KB 予算に入る */
const ROUND_DIGITS = 4;

function round(value: number): number {
	return Number(value.toFixed(ROUND_DIGITS));
}

/**
 * フラット f64 → ② §5-C の snapshot メッセージ。
 *
 * tick は sim が持たない（sim.h: tick 番号はサーバの所有物）ので引数で受ける。
 *
 * @param flat SimGame.readSnapshot() の戻り値。**この呼び出し中しか有効でない**
 */
export function decodeSnapshot(flat: Float64Array, tick: number): SnapshotMessage {
	if (flat.length < HEADER_DOUBLES) {
		throw new Error(`snapshot が短すぎる (${flat.length})`);
	}
	const state = flat[0]!;
	const winner = flat[1]!;
	const scoreRed = flat[2]!;
	const scoreBlue = flat[3]!;
	const count = flat[4]!;

	const combatants: CombatantView[] = [];
	for (let i = 0; i < count; i++) {
		const o = HEADER_DOUBLES + i * COMBATANT_DOUBLES;
		combatants.push({
			id: flat[o]!,
			team: flat[o + 1]!,
			hand: flat[o + 2]!,
			pos: [round(flat[o + 3]!), round(flat[o + 4]!)],
			dir: round(flat[o + 5]!),
			alive: flat[o + 6] !== 0,
			is_ai: flat[o + 7] !== 0,
			respawn_ms: Math.round(flat[o + 8]! * 1000),
		});
	}

	return {
		t: 'snapshot',
		d: {
			tick,
			match: {
				state: STATE_NAME[state] ?? 'playing',
				winner: winner < 0 ? null : winner,
				score: [scoreRed, scoreBlue],
			},
			combatants,
		},
	};
}
