// E-12 一方通行デモの記録側: Node 上の sim.wasm で権威実行し、
// ② §5-C 形式の snapshot JSON 列を書き出す（既定は RSP → snapshots.json）。
// B-10（GameRoom）ではこの「sim → JSON」部分が WS 配信に置き換わる。
// 実行: node web/sim_demo/record.mjs [rsp|fps]（要: make sim 済み）
// G-12: `fps` を渡すと FPS 1vs1（席0=外部入力、席1=AI）を記録し、
// snapshots_fps.json へ書く。目的は「試合の決着」ではなく、リモート席の
// テクスチャがカメラ相対角度で正しく回転すること（apply_remote_combatant の
// MODE_FPS 分岐）を replay.html で目視確認すること。そのため決着は要求しない
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const createSim = require(here('../build/sim.js'));

const MODE_ARG = process.argv[2];
if (MODE_ARG !== undefined && MODE_ARG !== 'rsp' && MODE_ARG !== 'fps') {
	throw new Error(`unknown mode "${MODE_ARG}" (expected "rsp" or "fps")`);
}
const MODE = MODE_ARG ?? 'rsp';
const MAP = MODE === 'fps' ? 'fps_map/fps_duel.cub' : 'rsp_map/rsp.cub';
const OUT_FILE = MODE === 'fps' ? 'snapshots_fps.json' : 'snapshots.json';
const SEAT_COUNT = MODE === 'fps' ? 2 : 4;
const VIEW_ID = 0;
const TARGET_SCORE = 3; // FPS では未使用（sim_create の引数を埋めるだけ）
// 乱数 seed を固定し、記録を毎回同一（決着まで含めて byte 単位で再現）にする。
// 0 だと時刻由来になり、決着時刻が走行ごとに変わる（上限打ち切りで
// finished に届かない記録ができる恐れがある）ため、デモでは必ず固定する
const SEED = 42;
const TICK_HZ = 30;     // シムの更新頻度（1秒に game_step を呼ぶ回数）。本番サーバも同じ 30Hz
const MAX_SECONDS = MODE === 'fps' ? 20 : 90; // 記録の上限。RSP は決着待ち、FPSは移動を見せるだけの固定尺
const TAIL_SECONDS = 2; // 決着後も結果画面確認用に少し流す（RSPのみ意味を持つ）

// フラット f64 snapshot のレイアウト定数（C 側 sim.h と一致）。
// HEADER=ヘッダ5個 [state,winner,score_red,score_blue,N] / PER=戦闘員1人9個
const HEADER = 5;
const PER = 9;
const STATE_NAME = { 1: 'playing', 2: 'finished' }; // sim.h の数値 → ② §5-C の文字列

const mapText = readFileSync(here(`../../maps/${MAP}`), 'utf8');
const M = await createSim();

function writeCString(text) {
	const bytes = new TextEncoder().encode(text);
	const ptr = M._malloc(bytes.length + 1);
	M.HEAPU8.set(bytes, ptr);
	M.HEAPU8[ptr + bytes.length] = 0;
	return ptr;
}

const mapPtr = writeCString(mapText);
const game = M._sim_create(mapPtr, MODE === 'rsp' ? 1 : 0, TARGET_SCORE, SEED);
M._free(mapPtr);
if (!game) throw new Error('sim_create failed');
// RSP: 席 0 = 外部入力（記録側が疑似入力を供給）、席 1..3 = AI
// FPS: 席 0 = 外部入力（見る側）、席 1 = AI（見られる側。徘徊・追跡で向きが変わる）
for (let s = 0; s < SEAT_COUNT; s++) {
	if (M._game_add_combatant(game, s, s === VIEW_ID ? 0 : 1) !== s) {
		throw new Error(`add_combatant(${s}) failed`);
	}
}

// フラット f64 snapshot → ② §5-C の JSON へ（サーバ側シリアライズの責務）
const snapPtr = M._malloc(8 * 256);
function takeSnapshot(tick) {
	const n = M._game_snapshot(game, snapPtr, 256);
	if (n < HEADER) throw new Error(`snapshot failed (${n})`);
	const f = new Float64Array(M.HEAPF64.buffer, snapPtr, n);
	const combatants = [];
	for (let i = 0; i < f[4]; i++) {
		const o = HEADER + i * PER;
		combatants.push({
			id: f[o], team: f[o + 1], hand: f[o + 2],
			pos: [Number(f[o + 3].toFixed(4)), Number(f[o + 4].toFixed(4))],
			dir: Number(f[o + 5].toFixed(4)),
			alive: f[o + 6] !== 0, is_ai: f[o + 7] !== 0,
			respawn_ms: Math.round(f[o + 8] * 1000),
		});
	}
	return {
		t: 'snapshot',
		d: {
			tick,
			match: {
				state: STATE_NAME[f[0]] ?? 'playing',
				// ② §5-C 改訂 2026-07-29: snapshot 単体で winner の意味を確定できるよう mode を含める。
				// B-10 の GameRoom は room.mode（'rsp'|'fps'）を渡す
				mode: MODE,
				winner: f[1] < 0 ? null : f[1],
				score: [f[2], f[3]],
			},
			combatants,
		},
	};
}

// 疑似プレイヤー入力: ゆっくり向きを変えながら前進し続ける決定的ワンダラー。
// FPS でも席0（見る側）をこれで動かし、席1（AI）が追跡/巡回で自然に向きを
// 変えるところを様々な角度から見られるようにする
let yaw = 0;
function driveExternalSeat(tick) {
	yaw += 0.9 / TICK_HZ + 0.35 * Math.sin(tick / 47) / TICK_HZ;
	M._sim_set_input(game, VIEW_ID, 1, 0, 0, 0, yaw);
}

const snapshots = [];
let finishedAt = -1;
let tick = 0;
while (tick < MAX_SECONDS * TICK_HZ) {
	driveExternalSeat(tick);
	const finished = M._game_step(game, 1 / TICK_HZ);
	tick++;
	if (tick % 2 === 0) snapshots.push(takeSnapshot(tick)); // 偶数 tick 配信（② §6-A）
	if (finished && finishedAt < 0) finishedAt = tick;
	if (MODE === 'rsp' && finishedAt > 0 && tick - finishedAt > TAIL_SECONDS * TICK_HZ) break;
}
M._game_destroy(game);
M._free(snapPtr);

if (MODE === 'rsp' && finishedAt < 0) {
	// 固定 seed では起きない想定。起きたら seed か MAX_SECONDS の見直しが必要
	throw new Error(`match did not finish within ${MAX_SECONDS}s (seed=${SEED})`);
}
const sizes = snapshots.map((s) => JSON.stringify(s).length);
const out = { map: MAP, view_id: VIEW_ID, tick_hz: TICK_HZ, seed: SEED, snapshots };
writeFileSync(here(OUT_FILE), JSON.stringify(out));
console.log(`[${MODE}] snapshots: ${snapshots.length} (${(tick / TICK_HZ).toFixed(1)}s, finished_at_tick=${finishedAt})`);
console.log(`payload bytes/snapshot: avg=${Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length)} max=${Math.max(...sizes)} (② §8 予算 < 1KB)`);
const last = snapshots[snapshots.length - 1].d;
console.log(`final: state=${last.match.state} winner=${last.match.winner} score=[${last.match.score}]`);
console.log(`wrote ${OUT_FILE}`);
