// W-10: フラット f64 の snapshot を ② §5-C の JSON へ変換する。
//
// **型と契約は `@ft/shared` の ws/game.ts が正本**（Issue #10 で配置を合意）。
// hminemur の F-06 は同じ定義を import するので、ここで形を変えると両方が壊れる
// ＝ 変えるときは ② の「5-C. snapshot ペイロード」を先に改訂すること（⑥ §7-3）。
//
// フラット配列のレイアウトの正本は codes/includes/platform/sim.h。
// 参照実装は web/sim_demo/record.mjs の takeSnapshot()。この関数は wasm に
// 触らない純関数なので、Float64Array を作れば単体テストできる。
import type { CombatantView, MatchState, SnapshotMessage } from '@ft/shared';

export type { CombatantView, MatchState, SnapshotMessage } from '@ft/shared';
export type { SnapshotPayload } from '@ft/shared';

/** snapshot 内の `match.mode`。② §5-C の改訂 2026-07-29 で追加 */
export type SnapshotMode = 'rsp' | 'fps';

/** sim.h の SIM_SNAP_HEADER_DOUBLES */
const HEADER_DOUBLES = 5;
/** sim.h の SIM_SNAP_COMBATANT_DOUBLES: [id,team,hand,x,y,dir,alive,is_ai,respawn_s] */
const COMBATANT_DOUBLES = 9;

/** sim.h の SIM_STATE_*。countdown は sim ではなくルーム層の event で表現する */
const STATE_NAME: Record<number, MatchState> = {
	1: 'playing',
	2: 'finished',
};

/** 座標・角度の丸め桁。これで 1 件 ≒ 520B に収まり ② §8 の 1KB 予算に入る */
const ROUND_DIGITS = 4;

function round(value: number): number {
	return Number(value.toFixed(ROUND_DIGITS));
}

/**
 * フラット f64 → ② §5-C の snapshot メッセージ。
 *
 * tick は sim が持たない（sim.h: tick 番号はサーバの所有物）ので引数で受ける。
 * mode も sim のフラット配列には含まれない（RSP/FPS は create 時点で確定して
 * いる情報）ので、呼び出し側が持っている値を渡す。② §5-C の改訂 2026-07-29 で
 * snapshot に `match.mode` を含める（snapshot 単体で winner の意味を確定できる）。
 *
 * @param flat SimGame.readSnapshot() の戻り値。**この呼び出し中しか有効でない**
 * @param tick サーバ側で採番している tick 番号
 * @param mode ルームのモード。welcome.mode と一致する（試合中は不変）
 */
export function decodeSnapshot(
	flat: Float64Array,
	tick: number,
	mode: SnapshotMode,
): SnapshotMessage {
	if (flat.length < HEADER_DOUBLES) {
		throw new Error(`snapshot が短すぎる (${flat.length})`);
	}
	const state = flat[0]!;
	const winner = flat[1]!;
	const scoreRed = flat[2]!;
	const scoreBlue = flat[3]!;
	const count = flat[4]!;
	const required = HEADER_DOUBLES + count * COMBATANT_DOUBLES;
	if (!Number.isInteger(count) || count < 0 || flat.length < required) {
		throw new Error(
			`snapshot combatant 数が不正 (count=${count}, length=${flat.length}, need=${required})`,
		);
	}

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
				mode,
				winner: winner < 0 ? null : winner,
				score: [scoreRed, scoreBlue],
			},
			combatants,
		},
	};
}
