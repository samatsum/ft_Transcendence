// スナップショット補間（E-12。④ §4 の分担で「壱 = wasm 呼び出しと補間計算」）。
// ② §5-C の JSON snapshot 2つを補間し、web_apply_snapshot が受けるフラット
// f64 配列（レイアウトは codes/includes/platform/sim.h）へ変換する。
// 位置は線形、向きは最短弧。離散値（state/score/hand/alive/チーム）は古い側
// s0 の値を使う（正本はサーバ。ここでは判定・演出を作らない）。
// F-06（GameView 統合）はこのファイルをそのまま流用する想定
(() => {
	// フラット f64 配列のレイアウト定数（C 側 sim.h の #define と一致させる正本）:
	// HEADER = 先頭のヘッダ要素数（SIM_SNAP_HEADER_DOUBLES）。中身は
	//   [0]=state [1]=winner(-1=未決着) [2]=score_red [3]=score_blue [4]=戦闘員数N
	// PER = 戦闘員1人あたりの要素数（SIM_SNAP_COMBATANT_DOUBLES）。中身は
	//   [id, team, hand, x, y, dir, alive, is_ai, respawn_s]
	// i 番目の戦闘員は out[HEADER + i*PER + フィールド番号] に入る
	const HEADER = 5;
	const PER = 9;
	// match.state の文字列（② §5-C）→ C 側 sim.h の数値。waiting はサーバから来ない
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
		out[0] = STATE_NUM[d.match.state] ?? 1;         // state
		out[1] = d.match.winner === null ? -1 : d.match.winner; // winner（-1=未決着）
		out[2] = d.match.score[0];                      // score_red
		out[3] = d.match.score[1];                      // score_blue
		out[4] = n;                                     // 戦闘員数
		d.combatants.forEach((c, i) => {
			const o = HEADER + i * PER;                 // i 番目の戦闘員の先頭
			out[o] = c.id;                              // 席 id
			out[o + 1] = c.team;                        // チーム（0=赤 1=青）
			out[o + 2] = c.hand;                        // 手（グー/チョキ/パー）
			out[o + 3] = c.pos[0];                      // x
			out[o + 4] = c.pos[1];                      // y
			out[o + 5] = c.dir;                         // 向き（ラジアン）
			out[o + 6] = c.alive ? 1 : 0;               // 生存
			out[o + 7] = c.is_ai ? 1 : 0;               // AI 席か
			out[o + 8] = (c.respawn_ms ?? 0) / 1000;    // 復帰までの秒
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
