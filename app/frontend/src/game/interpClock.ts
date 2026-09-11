// snapshot バッファから「いま描くべき2枚と補間係数」を選ぶ（GV-06 / ② §8）。
//
// 描画時刻は `performance.now() - INTERP_DELAY_MS` をそのまま使う。snapshot の
// receivedAtMs も performance.now なので、同じ時計の上で比べられる。
//
// **基準時刻を持たないこと（#194）。** 以前は「最初の snapshot 到着時刻」を基準にした
// 相対時計を持ち、描画時刻が最後の snapshot を追い越すたびに基準を打ち直していた。
// 決着後のように snapshot が二度と来ないと、打ち直し → 100ms 前から再生 → また追い越す、
// を無限に繰り返し、最後の数フレームがループ再生された。絶対時刻で選べば、追い越した後は
// 最後の snapshot で止まり、通信が戻れば新しい snapshot との間でそのまま補間が再開する。

/** 到着時刻（performance.now ミリ秒）を持つもの */
export interface Timed {
	receivedAtMs: number;
}

export interface FrameSelection<T extends Timed> {
	cur: T;
	/** 最後の snapshot を追い越しているときは null（cur をそのまま描く） */
	next: T | null;
	/** cur → next の補間係数（0〜1）。next が null なら 0 */
	alpha: number;
}

/**
 * @param buf 到着順に並んだ snapshot（古い順）
 * @param playAtMs 描画時刻（`performance.now() - INTERP_DELAY_MS`）
 * @returns バッファが空なら null
 */
export function selectFrame<T extends Timed>(
	buf: readonly T[],
	playAtMs: number,
): FrameSelection<T> | null {
	let i = 0;
	while (i + 1 < buf.length) {
		const nx = buf[i + 1];
		if (!nx || nx.receivedAtMs > playAtMs) break;
		i += 1;
	}
	const cur = buf[i];
	if (!cur) return null;
	const next = buf[i + 1] ?? null;
	if (!next) return { cur, next: null, alpha: 0 };
	const span = next.receivedAtMs - cur.receivedAtMs;
	let alpha = span > 0 ? (playAtMs - cur.receivedAtMs) / span : 0;
	if (alpha < 0) alpha = 0;
	if (alpha > 1) alpha = 1;
	return { cur, next, alpha };
}
