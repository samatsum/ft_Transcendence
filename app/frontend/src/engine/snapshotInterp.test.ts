import { describe, expect, it } from 'vitest';
import type { SnapshotPayload } from '@ft/shared';

import {
	SNAP_COMBATANT_DOUBLES,
	SNAP_HEADER_DOUBLES,
	flatten,
	interpolate,
} from './snapshotInterp.js';

function makeSnap(
	state: SnapshotPayload['match']['state'],
	combatants: SnapshotPayload['combatants'],
	scoreA = 0,
	scoreB = 0,
	winner: number | null = null,
): SnapshotPayload {
	return {
		tick: 0,
		match: { state, mode: 'rsp', winner, score: [scoreA, scoreB] },
		combatants,
	};
}

function seat(id: number, dir: number, x: number, y: number): SnapshotPayload['combatants'][0] {
	return { id, team: 0, hand: 0, pos: [x, y], dir, alive: true, is_ai: false, respawn_ms: 0 };
}

// noUncheckedIndexedAccess の下で Float64Array アクセスは `number | undefined` になる。
// テスト対象の範囲内であることは保証しているので、number として扱う小さなラッパを置く
function at(a: Float64Array, i: number): number {
	const v = a[i];
	if (v === undefined) throw new Error(`index ${i} out of range (len=${a.length})`);
	return v;
}

describe('flatten', () => {
	it('ヘッダに state/winner/score/N を書き込む', () => {
		const snap = makeSnap('playing', [seat(0, 0, 1, 2)], 7, 4, 1);
		const flat = flatten(snap);
		expect(at(flat, 0)).toBe(1); // playing
		expect(at(flat, 1)).toBe(1); // winner=1
		expect(at(flat, 2)).toBe(7); // score red
		expect(at(flat, 3)).toBe(4); // score blue
		expect(at(flat, 4)).toBe(1); // N
	});

	it('winner=null を -1 でエンコードする', () => {
		const snap = makeSnap('playing', [seat(0, 0, 0, 0)]);
		expect(at(flatten(snap), 1)).toBe(-1);
	});

	it('respawn_ms を秒へ変換する', () => {
		const snap = makeSnap('playing', [
			{ ...seat(0, 0, 0, 0), respawn_ms: 1500 },
		]);
		expect(at(flatten(snap), SNAP_HEADER_DOUBLES + 8)).toBeCloseTo(1.5);
	});
});

describe('interpolate', () => {
	it('位置を線形補間する', () => {
		const s0 = makeSnap('playing', [seat(0, 0, 0, 0)]);
		const s1 = makeSnap('playing', [seat(0, 0, 10, 20)]);
		const flat = interpolate(s0, s1, 0.5);
		expect(at(flat, SNAP_HEADER_DOUBLES + 3)).toBeCloseTo(5);
		expect(at(flat, SNAP_HEADER_DOUBLES + 4)).toBeCloseTo(10);
	});

	it('角度は最短弧で補間する（+π と -π をまたぐ）', () => {
		const s0 = makeSnap('playing', [seat(0, Math.PI - 0.1, 0, 0)]);
		const s1 = makeSnap('playing', [seat(0, -Math.PI + 0.1, 0, 0)]);
		const flat = interpolate(s0, s1, 0.5);
		const dir = at(flat, SNAP_HEADER_DOUBLES + 5);
		// 逆回りしない: πを超えたあたり（±πのちょうど境界）へ収束
		expect(Math.abs(Math.abs(dir) - Math.PI)).toBeLessThan(0.05);
	});

	it('d1 に居ない id は d0 の値をそのまま使う', () => {
		const s0 = makeSnap('playing', [seat(0, 0, 1, 2), seat(1, 0, 3, 4)]);
		const s1 = makeSnap('playing', [seat(0, 0, 10, 20)]); // id=1 いない
		const flat = interpolate(s0, s1, 1);
		expect(at(flat, SNAP_HEADER_DOUBLES + 3)).toBeCloseTo(10);
		const off = SNAP_HEADER_DOUBLES + SNAP_COMBATANT_DOUBLES;
		expect(at(flat, off + 3)).toBeCloseTo(3);
		expect(at(flat, off + 4)).toBeCloseTo(4);
	});

	it('d1=null なら d0 をそのまま flatten した結果', () => {
		const s0 = makeSnap('playing', [seat(0, 0.7, 1, 2)]);
		const flat = interpolate(s0, null, 0);
		expect(at(flat, SNAP_HEADER_DOUBLES + 5)).toBeCloseTo(0.7);
	});

	it('overrideDir が指定 id の dir を上書きする（自席の視点即時反映）', () => {
		const s0 = makeSnap('playing', [seat(0, 0, 0, 0), seat(1, 0, 5, 5)]);
		const s1 = makeSnap('playing', [seat(0, 1.0, 0, 0), seat(1, 1.0, 5, 5)]);
		const flat = interpolate(s0, s1, 0.5, { id: 1, dir: 2.5 });
		expect(at(flat, SNAP_HEADER_DOUBLES + 5)).toBeCloseTo(0.5);
		const off = SNAP_HEADER_DOUBLES + SNAP_COMBATANT_DOUBLES;
		expect(at(flat, off + 5)).toBeCloseTo(2.5);
	});

	it('overrideDir の id が居なくても壊れない', () => {
		const s0 = makeSnap('playing', [seat(0, 0, 0, 0)]);
		const flat = interpolate(s0, null, 0, { id: 99, dir: 1 });
		expect(at(flat, SNAP_HEADER_DOUBLES + 5)).toBeCloseTo(0);
	});
});
