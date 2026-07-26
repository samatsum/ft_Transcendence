// W-10 の確認用エントリ。Fastify も WS も通さず、Node 単体で sim を回す。
// 実行: npx tsx app/backend/src/game/dev-run.ts
//
// 検査1: web/sim_demo/record.mjs と **同じ条件で同じ結果**になること
//        （TypeScript 移植が忠実であることの保証）
// 検査2: ⑤ W-10 の受入条件「Node 上で複数ルーム同時進行」
//        30Hz の実時間で複数ルームを並走させ、全部が決着に到達することを見る
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { SimGame, INPUT_SRC_EXTERNAL, type SeatInput } from './sim.js';
import { decodeSnapshot, type SnapshotMessage } from './snapshot.js';
import { seatCount, type RoomEvent, type RoomLogger } from './room.js';
import { closeAllRooms, createRoom, roomCount, roomStates } from './rooms.js';

const MAP = 'rsp_map/rsp.cub';
const TICK_HZ = 30;

function mapPath(name: string): string {
	return fileURLToPath(new URL(`../../../../maps/${name}`, import.meta.url));
}

function loadMap(): string {
	return readFileSync(mapPath(MAP), 'utf8');
}

/* ── 検査1: record.mjs との一致 ───────────────────────────────────── */

const VIEW_ID = 0;
const SEED = 42; // 非 0 で乱数系列固定。record.mjs と揃える（申し送り 5）
const MAX_SECONDS = 90;
const TAIL_SECONDS = 2;
// record.mjs の実測値。移植がずれたらここで気づける
const EXPECT = { snapshots: 809, finishedAtTick: 1558, winner: 1, score: [0, 3] as const };

/** record.mjs の driveExternalSeat と同一。ゆっくり旋回しながら前進し続ける */
function pseudoInput(tick: number, yaw: number): { input: SeatInput; yaw: number } {
	const next = yaw + 0.9 / TICK_HZ + (0.35 * Math.sin(tick / 47)) / TICK_HZ;
	return {
		input: { forward: true, backward: false, strafeLeft: false, strafeRight: false, yaw: next },
		yaw: next,
	};
}

async function checkPortMatchesRecordMjs(): Promise<boolean> {
	const game = await SimGame.create({ cubText: loadMap(), mode: 'rsp', targetScore: 3, seed: SEED });
	for (let slot = 0; slot < 4; slot++) game.addCombatant(slot, true);
	game.setInputSource(VIEW_ID, INPUT_SRC_EXTERNAL);

	const snapshots: SnapshotMessage[] = [];
	let yaw = 0;
	let tick = 0;
	let finishedAt = -1;

	while (tick < MAX_SECONDS * TICK_HZ) {
		const driven = pseudoInput(tick, yaw);
		yaw = driven.yaw;
		game.setInput(VIEW_ID, driven.input);

		const finished = game.step(1 / TICK_HZ);
		tick++;
		if (tick % 2 === 0) snapshots.push(decodeSnapshot(game.readSnapshot(), tick));
		if (finished && finishedAt < 0) finishedAt = tick;
		if (finishedAt > 0 && tick - finishedAt > TAIL_SECONDS * TICK_HZ) break;
	}
	game.destroy();

	const last = snapshots.at(-1);
	if (!last) throw new Error('snapshot が1件も取れていない');
	const sizes = snapshots.map((s) => JSON.stringify(s).length);
	const avg = Math.round(sizes.reduce((a, b) => a + b, 0) / sizes.length);

	console.log(`  snapshots: ${snapshots.length} (${(tick / TICK_HZ).toFixed(1)}s, finished_at_tick=${finishedAt})`);
	console.log(`  payload bytes/snapshot: avg=${avg} max=${Math.max(...sizes)} (② §8 予算 < 1KB)`);
	console.log(`  final: state=${last.d.match.state} winner=${last.d.match.winner} score=[${last.d.match.score}]`);

	const bad: string[] = [];
	if (snapshots.length !== EXPECT.snapshots) bad.push(`snapshots ${snapshots.length} != ${EXPECT.snapshots}`);
	if (finishedAt !== EXPECT.finishedAtTick) bad.push(`finished_at_tick ${finishedAt} != ${EXPECT.finishedAtTick}`);
	if (last.d.match.winner !== EXPECT.winner) bad.push(`winner ${last.d.match.winner} != ${EXPECT.winner}`);
	if (last.d.match.score.join() !== EXPECT.score.join()) bad.push(`score ${last.d.match.score} != ${EXPECT.score}`);
	if (avg >= 1024) bad.push(`1KB 予算超過 (avg=${avg})`);

	if (bad.length > 0) {
		console.error(`  NG: record.mjs と不一致\n    ${bad.join('\n    ')}`);
		return false;
	}
	console.log('  OK: record.mjs と一致（移植は忠実）');
	return true;
}

/* ── 検査2: インスタンスの独立性（同期ループ・決定的） ───────────────── */

/**
 * ② §6 の「1試合 = 1ルーム = 1つの sim.wasm インスタンス」が本当に独立しているか。
 *
 * 同じ seed・同じ入力列を **同期ループで lockstep に** 与え、3 インスタンスの
 * snapshot が全 tick で一致することを見る。実時間を挟まないので決定的。
 * ずれたらインスタンス間で状態が漏れている（申し送り 8 の前提が崩れている）。
 */
async function checkInstancesAreIndependent(): Promise<boolean> {
	const cubText = loadMap();
	const games = await Promise.all(
		Array.from({ length: 3 }, () =>
			SimGame.create({ cubText, mode: 'rsp', targetScore: 3, seed: SEED }),
		),
	);
	for (const game of games) {
		for (let slot = 0; slot < 4; slot++) game.addCombatant(slot, true);
		game.setInputSource(VIEW_ID, INPUT_SRC_EXTERNAL);
	}

	let yaw = 0;
	let mismatchTick = -1;
	const TICKS = 600;
	for (let tick = 0; tick < TICKS && mismatchTick < 0; tick++) {
		const driven = pseudoInput(tick, yaw);
		yaw = driven.yaw;
		// 3 インスタンスへ同じ入力を与え、同じ dt で1 tick ずつ進める
		const json = games.map((game) => {
			game.setInput(VIEW_ID, driven.input);
			game.step(1 / TICK_HZ);
			return JSON.stringify(decodeSnapshot(game.readSnapshot(), tick + 1));
		});
		if (json.some((s) => s !== json[0])) mismatchTick = tick + 1;
	}
	for (const game of games) game.destroy();

	if (mismatchTick >= 0) {
		console.error(`  NG: tick ${mismatchTick} で 3 インスタンスの snapshot が食い違った`);
		return false;
	}
	console.log(`  ${games.length} インスタンス × ${TICKS} tick で snapshot が完全一致`);
	console.log('  OK: インスタンスは独立している（状態の漏れなし）');
	return true;
}

/* ── 検査3: 複数ルーム同時進行（実時間 30Hz） ──────────────────────── */

const ROOM_COUNT = 3;
/** 実時間 30Hz で回すので短い試合にする。エンジンは N>=1 を受理する（申し送り 5） */
const MULTI_ROOM_TARGET_SCORE = 1;
const MULTI_ROOM_TIMEOUT_MS = 60_000;

interface RoomStat {
	snapshots: number;
	events: string[];
	finished: boolean;
	finishedTick: number;
	/** 同じ tick の snapshot が2回流れていないか（決着 tick での二重配信の検出） */
	seenTicks: Set<number>;
	duplicateTicks: number[];
}

async function checkMultipleRoomsRunConcurrently(): Promise<boolean> {
	const cubText = loadMap();
	const stats = new Map<string, RoomStat>();
	const inputDrivers: NodeJS.Timeout[] = [];
	const bad: string[] = [];
	let overrunWarnings = 0;

	const log: RoomLogger = {
		info: (obj, msg) => console.log(`  ${msg}`, obj),
		warn: (obj, msg) => {
			overrunWarnings++;
			console.warn(`  ${msg}`, obj);
		},
	};

	for (let i = 0; i < ROOM_COUNT; i++) {
		const roomId = `dev-${i}`;
		const stat: RoomStat = {
			snapshots: 0,
			events: [],
			finished: false,
			finishedTick: -1,
			seenTicks: new Set(),
			duplicateTicks: [],
		};
		stats.set(roomId, stat);

		const room = await createRoom({
			roomId,
			cubText,
			mode: 'rsp',
			targetScore: MULTI_ROOM_TARGET_SCORE,
			// 短時間で決着する seed。**決着 tick の一致は要求しない** —
			// 入力ドライバとルームの tick は独立した setInterval なので、
			// どの tick にどの入力が乗るかが実時間で揺れる。決定性は検査2 の責務
			seed: SEED,
			// ② §6-A 追補: 人間は席0 のみで残り3席は AI。これを渡さないと
			// 「定員4人ぶんの人間」を待つことになり、10 秒経過するまで開始しない
			humanSlots: [0],
			log,
			onBroadcast: (message: SnapshotMessage | RoomEvent, serialized: string) => {
				// ② §5-B: 配信は1回だけ直列化した同一文字列
				if (serialized !== JSON.stringify(message)) {
					bad.push(`${roomId}: serialized がメッセージと一致しない`);
				}
				if (message.t === 'snapshot') {
					stat.snapshots++;
					if (stat.seenTicks.has(message.d.tick)) stat.duplicateTicks.push(message.d.tick);
					stat.seenTicks.add(message.d.tick);
					if (message.d.match.state === 'finished' && !stat.finished) {
						stat.finished = true;
						stat.finishedTick = message.d.tick;
					}
				} else {
					stat.events.push(message.d.kind);
				}
			},
		});

		// 席0に人間が座る。humanSlots=[0] なので予定していた人間席がこれで全部
		// 埋まり、② §4-C どおり 10 秒を待たずカウントダウンへ進むはず。
		// startNow() は呼ばない（呼ぶと早期開始の判定を検査できない）
		room.join(0);
		if (room.getState() !== 'countdown') {
			bad.push(`${roomId}: join 後に countdown へ進んでいない（state=${room.getState()}）`);
		}
		// 定員外の slot は弾かれること（② §2-B close 4003 相当）
		try {
			room.join(seatCount('rsp'));
			bad.push(`${roomId}: 定員外の slot が受理された`);
		} catch {
			/* 期待どおり */
		}

		// W-11 でクライアントから 30Hz で届く input を模擬する。
		// 入力を送らないと席が動かず、接触＝得点がほとんど起きない
		let yaw = 0;
		let clientTick = 0;
		const driver = setInterval(() => {
			const driven = pseudoInput(clientTick++, yaw);
			yaw = driven.yaw;
			room.setInput(0, driven.input);
		}, 1000 / TICK_HZ);
		driver.unref();
		inputDrivers.push(driver);
	}

	console.log(`  ${roomCount()} ルームを 30Hz で並走中…`);
	const startedAt = Date.now();
	while (Date.now() - startedAt < MULTI_ROOM_TIMEOUT_MS) {
		await sleep(250);
		if ([...stats.values()].every((s) => s.finished)) break;
	}
	const elapsedMs = Date.now() - startedAt;

	for (const [roomId, stat] of stats) {
		const kinds = [...new Set(stat.events)];
		console.log(
			`  ${roomId}: snapshots=${stat.snapshots} finished_at_tick=${stat.finishedTick} events=[${kinds.join(',')}]`,
		);
		if (!stat.finished) bad.push(`${roomId} が決着に到達していない`);
		if (!stat.events.includes('match_start')) bad.push(`${roomId} に match_start が無い`);
		if (!stat.events.includes('match_end')) bad.push(`${roomId} に match_end が無い`);
		// ② §5-D: RSP なら得点時に point_scored が出る
		if (!stat.events.includes('point_scored')) bad.push(`${roomId} に point_scored が無い`);
		if (stat.duplicateTicks.length > 0) {
			bad.push(`${roomId} が同じ tick の snapshot を二重配信 (${stat.duplicateTicks.join(',')})`);
		}
		// 配信は偶数 tick のみ = 実効 15Hz（② §6-A）
		const expectedSnapshots = Math.floor(stat.finishedTick / 2);
		if (Math.abs(stat.snapshots - expectedSnapshots) > 1) {
			bad.push(`${roomId} の配信数 ${stat.snapshots} が 15Hz 換算 ${expectedSnapshots} と合わない`);
		}
	}
	console.log(`  状態: ${JSON.stringify(roomStates())}（${(elapsedMs / 1000).toFixed(1)}s）`);
	console.log(`  tick 過負荷警告: ${overrunWarnings} 件`);

	for (const driver of inputDrivers) clearInterval(driver);
	closeAllRooms();

	if (bad.length > 0) {
		console.error(`  NG:\n    ${bad.join('\n    ')}`);
		return false;
	}
	console.log('  OK: 複数ルームが同時進行して全部決着した');
	return true;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ── 実行 ─────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
	console.log('検査1: record.mjs との一致');
	const portOk = await checkPortMatchesRecordMjs();

	console.log('\n検査2: sim インスタンスの独立性（② §6「1ルーム = 1インスタンス」）');
	const independentOk = await checkInstancesAreIndependent();

	console.log('\n検査3: 複数ルーム同時進行（⑤ W-10 受入条件）');
	const roomsOk = await checkMultipleRoomsRunConcurrently();

	if (!portOk || !independentOk || !roomsOk) {
		console.error('\nW-10: 失敗');
		process.exit(1);
	}
	console.log('\nW-10: 受入条件を満たしています');
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
