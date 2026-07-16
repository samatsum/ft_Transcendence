// スナップショット補間（E-12。④ §4 の分担で「壱 = wasm 呼び出しと補間計算」）。
// ② §5-C の JSON snapshot 2つを補間し、web_apply_snapshot が受けるフラット
// f64 配列（レイアウトは codes/includes/platform/sim.h）へ変換する。
// 位置は線形、向きは最短弧。離散値（state/score/hand/alive/チーム）は古い側
// s0 の値を使う（正本はサーバ。ここでは判定・演出を作らない）。
// F-06（GameView 統合）はこのファイルをそのまま流用する想定
(() => {
	const HEADER = 5;
	const PER = 9;
	const STATE_NUM = { waiting: 0, playing: 1, finished: 2 };

	// 最短弧で角度を補間する（±π をまたぐ回転が逆回りに見えないように）
	function lerpAngle(a, b, alpha) {
		let diff = b - a;
		while (diff > Math.PI) diff -= 2 * Math.PI;
		while (diff < -Math.PI) diff += 2 * Math.PI;
		return a + diff * alpha;
	}

	// JSON snapshot（② §5-C の d）1つをフラット f64 配列へ変換する
	function flatten(d) {
		const n = d.combatants.length;
		const out = new Float64Array(HEADER + n * PER);
		out[0] = STATE_NUM[d.match.state] ?? 1;
		out[1] = d.match.winner === null ? -1 : d.match.winner;
		out[2] = d.match.score[0];
		out[3] = d.match.score[1];
		out[4] = n;
		d.combatants.forEach((c, i) => {
			const o = HEADER + i * PER;
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

	// s0 と s1 の間を alpha (0..1) で補間したフラット配列を返す。
	// 戦闘員は id で対応づけ、s1 に居ない id は s0 の値をそのまま使う
	function interpolate(d0, d1, alpha) {
		const out = flatten(d0);
		if (!d1 || alpha <= 0) {
			return out;
		}
		const later = new Map(d1.combatants.map((c) => [c.id, c]));
		d0.combatants.forEach((c, i) => {
			const next = later.get(c.id);
			if (!next) {
				return;
			}
			const o = HEADER + i * PER;
			out[o + 3] = c.pos[0] + (next.pos[0] - c.pos[0]) * alpha;
			out[o + 4] = c.pos[1] + (next.pos[1] - c.pos[1]) * alpha;
			out[o + 5] = lerpAngle(c.dir, next.dir, alpha);
		});
		return out;
	}

	window.Cub3DSnapshotInterp = { flatten, interpolate };
})();
