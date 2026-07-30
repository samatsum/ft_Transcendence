// ② §5-C 補間契約の TS 実装（F-06）。web/snapshot_interp.js（E-12・IIFE + window global）
// を React/TS 世界から使える純関数へ移植。
//
// - 位置は線形、向きは最短弧（±π をまたぐ回転が逆回りに見えないように）。
// - 離散値（state/score/hand/alive/is_ai/team）は古い側 s0 の値を使う。
//   正本はサーバで、ここは補間の便宜なので判定・演出を作らない。
// - `overrideDir` は F-06 で追加した第4引数（穴3 の決定）。② §5-C
//   「自分の yaw のみローカル優先」を、`web_apply_snapshot` へ書き込む直前の
//   flat 配列で反映するための口。welcome.combatant_id と一致する席の dir を
//   local yaw で上書きしてから wasm へ渡す。

import type { SnapshotPayload } from '@ft/shared';

// フラット f64 配列のレイアウト（C 側 codes/includes/platform/sim.h の #define と一致）:
//   HEADER: [state, winner(-1=未決着), score_red, score_blue, 戦闘員数N]
//   PER   : [id, team, hand, x, y, dir, alive, is_ai, respawn_s]
// i 番目の戦闘員は out[HEADER + i*PER + フィールド番号]
export const SNAP_HEADER_DOUBLES = 5;
export const SNAP_COMBATANT_DOUBLES = 9;

// match.state 文字列 → sim.h の数値
const STATE_NUM: Record<SnapshotPayload['match']['state'], number> = {
	waiting: 0,
	playing: 1,
	finished: 2,
};

// 最短弧で角度を補間
function lerpAngle(a: number, b: number, alpha: number): number {
	let diff = b - a;
	while (diff > Math.PI) diff -= 2 * Math.PI;
	while (diff < -Math.PI) diff += 2 * Math.PI;
	return a + diff * alpha;
}

// snapshot 1枚 → フラット f64 配列
export function flatten(d: SnapshotPayload): Float64Array {
	const n = d.combatants.length;
	const out = new Float64Array(SNAP_HEADER_DOUBLES + n * SNAP_COMBATANT_DOUBLES);
	out[0] = STATE_NUM[d.match.state] ?? 1;
	out[1] = d.match.winner === null ? -1 : d.match.winner;
	out[2] = d.match.score[0];
	out[3] = d.match.score[1];
	out[4] = n;
	d.combatants.forEach((c, i) => {
		const o = SNAP_HEADER_DOUBLES + i * SNAP_COMBATANT_DOUBLES;
		out[o] = c.id;
		out[o + 1] = c.team;
		out[o + 2] = c.hand;
		out[o + 3] = c.pos[0];
		out[o + 4] = c.pos[1];
		out[o + 5] = c.dir;
		out[o + 6] = c.alive ? 1 : 0;
		out[o + 7] = c.is_ai ? 1 : 0;
		out[o + 8] = (c.respawn_ms ?? 0) / 1000;
	});
	return out;
}

export interface OverrideDir {
	/** 上書き対象の戦闘員 id（welcome.combatant_id と一致させる） */
	id: number;
	/** ラジアン。クライアント側で積分した local yaw */
	dir: number;
}

/**
 * d0 と d1 の間を alpha (0..1) で補間したフラット配列を返す。
 * 戦闘員は id で対応づけ、d1 に居ない id は d0 の値をそのまま使う。
 *
 * @param overrideDir 指定 id の席の dir を local yaw で上書き（自席の視点即時反映）
 */
export function interpolate(
	d0: SnapshotPayload,
	d1: SnapshotPayload | null,
	alpha: number,
	overrideDir?: OverrideDir,
): Float64Array {
	const out = flatten(d0);
	if (d1 && alpha > 0) {
		const later = new Map(d1.combatants.map((c) => [c.id, c]));
		d0.combatants.forEach((c, i) => {
			const next = later.get(c.id);
			if (!next) return;
			const o = SNAP_HEADER_DOUBLES + i * SNAP_COMBATANT_DOUBLES;
			out[o + 3] = c.pos[0] + (next.pos[0] - c.pos[0]) * alpha;
			out[o + 4] = c.pos[1] + (next.pos[1] - c.pos[1]) * alpha;
			out[o + 5] = lerpAngle(c.dir, next.dir, alpha);
		});
	}
	if (overrideDir) {
		const idx = d0.combatants.findIndex((c) => c.id === overrideDir.id);
		if (idx >= 0) {
			out[SNAP_HEADER_DOUBLES + idx * SNAP_COMBATANT_DOUBLES + 5] = overrideDir.dir;
		}
	}
	return out;
}
