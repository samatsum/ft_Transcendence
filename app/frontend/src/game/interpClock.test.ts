import { describe, expect, it } from 'vitest';

import { selectFrame, type Timed } from './interpClock.js';

interface Snap extends Timed {
	tick: number;
}

const INTERVAL_MS = 67; // 15Hz 配信の到着間隔
const DELAY_MS = 100; // useEngineRenderer の INTERP_DELAY_MS

/** 到着時刻 startMs から INTERVAL_MS 刻みで count 枚、tick を2ずつ進めた snapshot */
function stream(count: number, startMs = 0, firstTick = 0): Snap[] {
	return Array.from({ length: count }, (_, k) => ({
		receivedAtMs: startMs + k * INTERVAL_MS,
		tick: firstTick + k * 2,
	}));
}

describe('selectFrame', () => {
	it('バッファが空なら null', () => {
		expect(selectFrame([], 1000)).toBeNull();
	});

	it('2枚の到着時刻の間を補間する', () => {
		const buf = stream(3);
		const sel = selectFrame(buf, INTERVAL_MS / 2);
		expect(sel?.cur.tick).toBe(0);
		expect(sel?.next?.tick).toBe(2);
		expect(sel?.alpha).toBeCloseTo(0.5);
	});

	it('描画時刻がバッファより前なら先頭を描く', () => {
		const buf = stream(3, 500);
		const sel = selectFrame(buf, 100);
		expect(sel?.cur.tick).toBe(0);
		expect(sel?.alpha).toBe(0);
	});

	// #194 の回帰: 決着後は snapshot が二度と来ない。旧実装は基準時刻を打ち直し続け、
	// 約112ms 周期で直前の2フレームを行き来した（決着フレームは表示されなかった）
	it('snapshot が止まったら最後の1枚で静止し、以後いつまでも同じフレームを返す', () => {
		const buf = stream(8, 0, 24); // 最後は tick 38
		const tail = buf[buf.length - 1]!;
		const seen = new Set<number>();
		// 描画時刻が tail を過ぎた時点（到着から 100ms 後）から 5 秒間、60fps で描き続ける
		for (let now = tail.receivedAtMs + DELAY_MS; now <= tail.receivedAtMs + 5000; now += 16) {
			const sel = selectFrame(buf, now - DELAY_MS);
			seen.add(sel!.cur.tick);
			expect(sel?.next).toBeNull();
		}
		expect([...seen]).toEqual([38]);
	});

	it('停止直後は 100ms かけて最後の1枚まで進み、戻らない', () => {
		const buf = stream(8, 0, 24);
		const tail = buf[buf.length - 1]!;
		let prevTick = -1;
		let prevAlpha = -1;
		for (let now = tail.receivedAtMs; now <= tail.receivedAtMs + 1000; now += 16) {
			const sel = selectFrame(buf, now - DELAY_MS)!;
			// 再生位置は単調に進む（tick が戻る、または同じ tick で alpha が戻ることがない）
			if (sel.cur.tick === prevTick) expect(sel.alpha).toBeGreaterThanOrEqual(prevAlpha);
			else expect(sel.cur.tick).toBeGreaterThan(prevTick);
			prevTick = sel.cur.tick;
			prevAlpha = sel.alpha;
		}
		expect(prevTick).toBe(38);
	});

	it('通信が途切れて再開したら、最後の1枚と新しい snapshot の間で補間を再開する', () => {
		const buf = stream(4); // tick 0..6、最後は 201ms
		const gapEnd = 201 + 1000;
		buf.push({ receivedAtMs: gapEnd, tick: 100 });
		// 再開直後（描画時刻 = 到着時刻 - 100ms）は、tick 6 → tick 100 の間の 90% 地点
		const sel = selectFrame(buf, gapEnd - DELAY_MS);
		expect(sel?.cur.tick).toBe(6);
		expect(sel?.next?.tick).toBe(100);
		expect(sel?.alpha).toBeCloseTo(0.9);
		// 100ms 後には新しい snapshot に追いつく
		expect(selectFrame(buf, gapEnd)?.cur.tick).toBe(100);
	});

	it('描画を始めた時刻に依存せず、最新の到着から 100ms 遅れの位置を選ぶ', () => {
		// selectFrame は基準時刻を持たないので、テクスチャ読み込みが長引いて描画の開始が
		// 遅れても、バッファ先頭の古さが遅延に加わらない（旧実装は先頭の到着時刻を基準にしていた）
		const buf = stream(8, 10_000);
		const tail = buf[buf.length - 1]!;
		// tail - 100ms は、tail - 134ms（3枚目）と tail - 67ms（2枚目）の間
		const sel = selectFrame(buf, tail.receivedAtMs - DELAY_MS);
		expect(sel?.cur).toBe(buf[buf.length - 3]);
		expect(sel?.next).toBe(buf[buf.length - 2]);
		expect(sel?.alpha).toBeCloseTo((2 * INTERVAL_MS - DELAY_MS) / INTERVAL_MS);
	});
});
