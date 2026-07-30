// W-11 の確認用エントリ。**ブラウザを使わず**に受入条件を検証する。
// 実行: npx tsx app/backend/src/game/ws-check.ts
//
// 検査1: 対人戦の疎通 — 2クライアントが join → welcome → input → snapshot → match_end
// 検査2: ② §10 受入条件 №6 — 不正メッセージ4種がそれぞれ仕様どおりに扱われる
// 検査3: W-12 — 30秒grace内の復帰、満了AI確定、RSP abandon、FPS forfeit
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import WebSocket from 'ws';
import { WS_CLOSE, type GameServerMessage } from '@ft/shared';

import { buildServer } from '../index.js';
import { listMaps, loadMapText } from './maps.js';
import {
	closeAllRooms,
	closeRoom,
	createRoom,
	createRoomFromRules,
} from './rooms.js';
import type { PersistedMatchContext } from './room.js';

const PORT = 3999;
const MAP = 'rsp_map/rsp.cub';
const TICK_HZ = 30;
const WS_OPEN_TIMEOUT_MS = 5_000;

function loadMap(): string {
	return readFileSync(fileURLToPath(new URL(`../../../../maps/${MAP}`, import.meta.url)), 'utf8');
}

function sleep(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

/** 1クライアント。受信を種別ごとに貯める */
class TestClient {
	readonly received: GameServerMessage[] = [];
	readonly errors: { code: string; msg: string }[] = [];
	readonly connectionErrors: Error[] = [];
	closedWith: number | null = null;
	private readonly ws: WebSocket;

	constructor(roomId: string, readonly userId: number) {
		this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/game/${roomId}`, {
			headers: { 'x-dev-user': String(userId) },
			origin: `http://127.0.0.1:${PORT}`,
		});
		this.ws.on('message', (data) => {
			const parsed = JSON.parse(String(data)) as GameServerMessage | { t: 'error'; d: { code: string; msg: string } };
			if (parsed.t === 'error') this.errors.push(parsed.d);
			else this.received.push(parsed);
		});
		this.ws.on('close', (code) => {
			this.closedWith = code;
		});
		this.ws.on('error', (error) => {
			this.connectionErrors.push(error);
		});
	}

	async open(): Promise<void> {
		if (this.ws.readyState === WebSocket.OPEN) return;
		if (this.ws.readyState === WebSocket.CLOSING || this.ws.readyState === WebSocket.CLOSED) {
			throw new Error(`WebSocket handshake cannot start from readyState=${this.ws.readyState}`);
		}

		await new Promise<void>((resolve, reject) => {
			let settled = false;
			let timer: NodeJS.Timeout;
			const cleanup = (): void => {
				clearTimeout(timer);
				this.ws.off('open', onOpen);
				this.ws.off('error', onError);
				this.ws.off('close', onClose);
			};
			const finish = (error?: Error): void => {
				if (settled) return;
				settled = true;
				cleanup();
				if (error) reject(error);
				else resolve();
			};
			const onOpen = (): void => finish();
			const onError = (error: Error): void => finish(error);
			const onClose = (code: number): void =>
				finish(new Error(`WebSocket closed before open (code=${code})`));

			timer = setTimeout(
				() => finish(new Error(`WebSocket open timed out after ${WS_OPEN_TIMEOUT_MS}ms`)),
				WS_OPEN_TIMEOUT_MS,
			);
			this.ws.once('open', onOpen);
			this.ws.once('error', onError);
			this.ws.once('close', onClose);

			// 最初の readyState 確認と listener 登録の間に状態が変わった場合も取りこぼさない。
			if (this.ws.readyState === WebSocket.OPEN) onOpen();
			else if (this.ws.readyState === WebSocket.CLOSING || this.ws.readyState === WebSocket.CLOSED) {
				onClose(this.ws.readyState);
			}
		});
	}

	sendRaw(text: string): void {
		if (this.ws.readyState === WebSocket.OPEN) this.ws.send(text);
	}

	send(message: unknown): void {
		this.sendRaw(JSON.stringify(message));
	}

	countOf(t: GameServerMessage['t']): number {
		return this.received.filter((m) => m.t === t).length;
	}

	find<T extends GameServerMessage['t']>(t: T): Extract<GameServerMessage, { t: T }> | undefined {
		return this.received.find((m) => m.t === t) as Extract<GameServerMessage, { t: T }> | undefined;
	}

	/** predicate成立を3秒までpollし、timeoutは後続検査を止めず収集する */
	async waitFor(predicate: () => boolean, label: string, bad: string[]): Promise<boolean> {
		const started = Date.now();
		while (Date.now() - started < 3_000) {
			if (predicate()) return true;
			await sleep(10);
		}
		bad.push(`timeout waiting for ${label}`);
		return false;
	}

	close(): void {
		this.ws.close();
	}
}

/* ── 検査1: 2クライアントで対人戦が成立する ─────────────────────── */

async function checkTwoClientsPlay(): Promise<string[]> {
	const bad: string[] = [];
	const resultOrder: string[] = [];
	let deliveredMatchId: number | null = null;
	const room = await createRoomFromRules({
		roomId: 'ws-play',
		mode: 'rsp',
		rules: { map: 'rsp', target_score: 1 }, // 実時間で回すので短く
		seed: 42,
		// ② §4-C の participant 登録。userId 101 → slot 0 / 102 → slot 1
		participants: [
			{ userId: 101, slot: 0 },
			{ userId: 102, slot: 1 },
		],
		onBroadcast: (message) => {
			if (message.t === 'event' && message.d.kind === 'match_end') resultOrder.push('match_end');
		},
		persistMatch: async (context) => {
			resultOrder.push('persist');
			return {
				matchId: 123,
				result: {
					match_id: 123,
					mode: context.mode,
					end_reason: context.reason,
					winner_team:
						context.mode === 'rsp' && (context.winner === 0 || context.winner === 1)
							? context.winner
							: null,
					winner_user_id: null,
					players: [],
				},
			};
		},
		onMatchResult: (result) => {
			resultOrder.push('match_result');
			deliveredMatchId = result.match_id;
		},
		log: { info: () => {}, warn: () => {} },
	});

	const a = new TestClient('ws-play', 101);
	const b = new TestClient('ws-play', 102);
	await Promise.all([a.open(), b.open()]);
	a.send({ t: 'join' });
	b.send({ t: 'join' });
	await sleep(200);

	// welcome は接続ごとに内容が違う
	const wa = a.find('welcome');
	const wb = b.find('welcome');
	if (!wa || !wb) {
		bad.push('welcome が届いていない');
		return bad;
	}
	console.log(`  welcome: A slot=${wa.d.slot} / B slot=${wb.d.slot} / map_text=${wa.d.map_text.length}B / snap_rate=${wa.d.snap_rate}`);
	if (wa.d.slot !== 0 || wb.d.slot !== 1) bad.push(`slot の割当が participants と違う (${wa.d.slot}, ${wb.d.slot})`);
	if (wa.d.combatant_id !== wa.d.slot) bad.push('combatant_id が slot と一致しない');
	if (wa.d.map_text.length < 100) bad.push('welcome.map_text が空に近い');
	if (wa.d.tick_rate !== 30 || wa.d.snap_rate !== 15 || wa.d.interp_ms !== 100) {
		bad.push(`welcome のレート情報が仕様と違う (${wa.d.tick_rate}/${wa.d.snap_rate}/${wa.d.interp_ms})`);
	}

	// 2人とも join したので、10 秒を待たず countdown → playing へ進むはず
	if (room.getState() !== 'countdown') bad.push(`join 後に countdown へ進んでいない (${room.getState()})`);

	// 30Hz で入力を流す（両クライアントとも前進しながら旋回）
	let seq = 0;
	let yaw = 0;
	const driver = setInterval(() => {
		yaw += 0.9 / TICK_HZ + (0.35 * Math.sin(seq / 47)) / TICK_HZ;
		seq += 1;
		for (const c of [a, b]) c.send({ t: 'input', d: { seq, yaw, mv: 0b0001 } });
	}, 1000 / TICK_HZ);
	driver.unref();

	const startedAt = Date.now();
	while (Date.now() - startedAt < 30_000) {
		await sleep(200);
		const ended = a.received.some((m) => m.t === 'event' && m.d.kind === 'match_end');
		if (ended) break;
	}
	clearInterval(driver);
	await sleep(100);

	const kinds = [...new Set(a.received.filter((m) => m.t === 'event').map((m) => (m as { d: { kind: string } }).d.kind))];
	console.log(`  A: snapshot=${a.countOf('snapshot')} events=[${kinds.join(',')}]`);
	console.log(`  B: snapshot=${b.countOf('snapshot')} events=[${kinds.length ? '同上' : 'なし'}]`);

	if (a.countOf('snapshot') < 5) bad.push('A に snapshot が届いていない');
	if (b.countOf('snapshot') < 5) bad.push('B に snapshot が届いていない');
	// ② §5-B: 全参加者へ同一の文字列を配信するので、件数は一致するはず
	if (Math.abs(a.countOf('snapshot') - b.countOf('snapshot')) > 1) {
		bad.push(`A と B で snapshot 件数が食い違う (${a.countOf('snapshot')} vs ${b.countOf('snapshot')})`);
	}
	if (!kinds.includes('match_start')) bad.push('match_start が無い');
	if (!kinds.includes('match_end')) bad.push('match_end が無い');
	const matchEnd = a.received.find((m) => m.t === 'event' && m.d.kind === 'match_end');
	if (
		!matchEnd ||
		matchEnd.t !== 'event' ||
		matchEnd.d.kind !== 'match_end' ||
		matchEnd.d.match_id !== 123
	) {
		bad.push('persistMatch の matchId が match_end.d.match_id に載っていない');
	}
	if (deliveredMatchId !== 123 || resultOrder.join('>') !== 'persist>match_end>match_result') {
		bad.push(`永続化→match_end→match_result の順序が不正 (${resultOrder.join('>')})`);
	}

	const sizes = a.received.filter((m) => m.t === 'snapshot').map((m) => JSON.stringify(m).length);
	const avg = Math.round(sizes.reduce((x, y) => x + y, 0) / Math.max(1, sizes.length));
	console.log(`  受入 №5: snapshot avg=${avg}B max=${Math.max(...sizes)}B (< 1KB)`);
	if (avg >= 1024) bad.push(`受入 №5 違反: snapshot が 1KB 超 (avg=${avg})`);

	a.close();
	b.close();
	return bad;
}

/* ── 検査2: 受入条件 №6（不正メッセージ） ───────────────────────── */

async function checkInvalidMessages(): Promise<string[]> {
	const bad: string[] = [];
	await createRoom({
		roomId: 'ws-bad',
		cubText: loadMap(),
		mode: 'rsp',
		targetScore: 3,
		seed: 42,
		participants: [{ userId: 201, slot: 0 }],
		log: { info: () => {}, warn: () => {} },
	});

	// (a) スキーマ違反 → error を返すが切断しない
	const c1 = new TestClient('ws-bad', 201);
	await c1.open();
	c1.send({ t: 'input', d: { seq: 1, yaw: 'not-a-number', mv: 0 } });
	await sleep(120);
	if (c1.errors.length !== 1) bad.push(`(a) スキーマ違反で error が1件返らない (${c1.errors.length}件)`);
	if (c1.closedWith !== null) bad.push(`(a) スキーマ違反で切断された (code=${c1.closedWith})`);
	console.log(`  (a) スキーマ違反 → error=${c1.errors.length}件 / 切断=${c1.closedWith === null ? 'なし' : c1.closedWith} ✓`);

	// (b) NaN / Infinity も弾かれる（申し送り 7）
	c1.sendRaw('{"t":"input","d":{"seq":2,"yaw":null,"mv":0}}');
	await sleep(120);
	if (c1.errors.length !== 2) bad.push('(b) NaN 相当の yaw が弾かれていない');
	console.log(`  (b) yaw=null → error=${c1.errors.length}件目 ✓`);

	// (c) 連続10回のスキーマ違反 → close 4001
	for (let i = 0; i < 10; i++) c1.send({ t: 'nonsense' });
	await sleep(250);
	if (c1.closedWith !== WS_CLOSE.protocolViolation) {
		bad.push(`(c) 連続違反で close 4001 にならない (code=${c1.closedWith})`);
	}
	console.log(`  (c) 連続10回の違反 → close ${c1.closedWith} ✓`);

	// (d) 4KB 超 → 即 close 4001
	const c2 = new TestClient('ws-bad', 202);
	await c2.open();
	c2.sendRaw(JSON.stringify({ t: 'input', d: { seq: 1, yaw: 0, mv: 0, pad: 'x'.repeat(5000) } }));
	await sleep(200);
	if (c2.closedWith !== WS_CLOSE.protocolViolation) {
		bad.push(`(d) 4KB 超で close 4001 にならない (code=${c2.closedWith})`);
	}
	if (c2.errors.length > 0) bad.push('(d) 4KB 超で error を返している（即切断のはず）');
	console.log(`  (d) 4KB 超 → close ${c2.closedWith}（error は返さない）✓`);

	// (e) participant でない → close 4003
	const c3 = new TestClient('ws-bad', 999);
	await c3.open();
	c3.send({ t: 'join' });
	await sleep(200);
	if (c3.closedWith !== WS_CLOSE.notAllowed) bad.push(`(e) 非 participant が close 4003 にならない (code=${c3.closedWith})`);
	console.log(`  (e) 非 participant の join → close ${c3.closedWith} ✓`);

	// (f) 存在しないルーム → close 4002
	const c4 = new TestClient('no-such-room', 201);
	await c4.open().catch(() => {});
	await sleep(200);
	if (c4.closedWith !== WS_CLOSE.roomNotFound) bad.push(`(f) 不明なルームが close 4002 にならない (code=${c4.closedWith})`);
	console.log(`  (f) 不明なルーム → close ${c4.closedWith} ✓`);

	// (g) seq 逆行 → 黙って破棄（error も切断も無し）
	const c5 = new TestClient('ws-bad', 201);
	await c5.open();
	c5.send({ t: 'join' });
	await sleep(150);
	c5.send({ t: 'input', d: { seq: 100, yaw: 0, mv: 1 } });
	c5.send({ t: 'input', d: { seq: 50, yaw: 0, mv: 1 } });
	c5.send({ t: 'input', d: { seq: 100, yaw: 0, mv: 1 } });
	await sleep(200);
	if (c5.errors.length !== 0) bad.push(`(g) seq 逆行で error が返った (${c5.errors.length}件)`);
	if (c5.closedWith !== null) bad.push(`(g) seq 逆行で切断された (code=${c5.closedWith})`);
	console.log(`  (g) seq 逆行（100→50→100）→ error=0件 / 切断なし ✓`);

	// (h) 同一ユーザーの新接続が旧接続を置換し、同じ席の入力を引き継げる
	const c7 = new TestClient('ws-bad', 201);
	await c7.open();
	c7.send({ t: 'join' });
	await sleep(250);
	if (c5.closedWith !== WS_CLOSE.replaced) {
		bad.push(`(h) 旧接続が close 4004 にならない (code=${c5.closedWith})`);
	}
	const replacementWelcome = c7.find('welcome');
	if (replacementWelcome?.d.slot !== 0) {
		bad.push(`(h) 置換接続が元の slot 0 を引き継がない (slot=${replacementWelcome?.d.slot})`);
	}
	await sleep(3_400);
	const replacementYaw = 1.25;
	c7.send({ t: 'input', d: { seq: 0, yaw: replacementYaw, mv: 0 } });
	await sleep(250);
	const replacementSnapshot = c7.received
		.filter((m): m is Extract<GameServerMessage, { t: 'snapshot' }> => m.t === 'snapshot')
		.at(-1);
	const replacementSeat = replacementSnapshot?.d.combatants.find((x) => x.id === 0);
	if (!replacementSeat || replacementSeat.is_ai) {
		bad.push('(h) 置換後の slot 0 が人間入力の所有状態を維持していない');
	} else {
		const angleError = Math.abs(
			Math.atan2(Math.sin(replacementSeat.dir - replacementYaw), Math.cos(replacementSeat.dir - replacementYaw)),
		);
		if (angleError > 0.05) {
			bad.push(`(h) 置換接続の入力が slot 0 に反映されない (dir=${replacementSeat.dir})`);
		}
	}
	console.log(`  (h) 同一ユーザー置換 → 旧 close=${c5.closedWith} / slot=${replacementWelcome?.d.slot} ✓`);

	// (i) 巨大な yaw が [-π,π) に正規化される（② §5-A）
	//     playing でないと snapshot が流れず「0件を検査して合格」になるので、
	//     専用ルームを作って必ず playing まで進めてから測る
	await createRoom({
		roomId: 'ws-yaw',
		cubText: loadMap(),
		mode: 'rsp',
		targetScore: 21, // 検査中に決着しないよう長く
		seed: 42,
		participants: [{ userId: 301, slot: 0 }],
		log: { info: () => {}, warn: () => {} },
	});
	const c6 = new TestClient('ws-yaw', 301);
	await c6.open();
	c6.send({ t: 'join' }); // 予定していた人間席が埋まるので countdown(3s) → playing
	await sleep(3600);
	c6.send({ t: 'input', d: { seq: 1, yaw: 1e30, mv: 0b0001 } });
	await sleep(500);
	const dirs = c6.received
		.filter((m): m is Extract<GameServerMessage, { t: 'snapshot' }> => m.t === 'snapshot')
		.flatMap((m) => m.d.combatants.map((x) => x.dir));
	const outOfRange = dirs.filter((d) => !Number.isFinite(d) || Math.abs(d) > Math.PI + 1e-6);
	if (dirs.length === 0) bad.push('(i) snapshot が届かず検査になっていない（playing まで進んでいない）');
	if (c6.errors.length !== 0) bad.push('(i) 有限な巨大 yaw が error になった');
	if (outOfRange.length > 0) bad.push(`(i) dir が [-π,π) の外に出た (${outOfRange.slice(0, 3).join(', ')})`);
	console.log(`  (i) yaw=1e30 → dir は全て [-π,π) 内（${dirs.length}件検査）✓`);
	c6.close();
	c7.close();

	c5.close();
	return bad;
}

/* ── 検査3: W-12 切断・再接続・AI代替 ───────────────────────────── */

/** 30秒graceのRSP復帰/全員abandonとFPS forfeitを実WSで検査する */
async function checkReconnectAndForfeit(): Promise<string[]> {
	const bad: string[] = [];
	const clients: TestClient[] = [];
	try {
		await runReconnectAndForfeitChecks(bad, clients);
	} catch (error) {
		bad.push(`W-12検査中の例外: ${error instanceof Error ? error.message : String(error)}`);
	} finally {
		for (const client of clients) client.close();
		for (const roomId of [
			'ws-reconnect-rsp',
			'ws-reconnect-fps',
			'ws-leave-fps',
			'ws-late-initial-rsp',
		]) {
			closeRoom(roomId);
		}
	}
	return bad;
}

/** W-12の各シナリオを順に実行し、失敗をbadへ集約する */
async function runReconnectAndForfeitChecks(
	bad: string[],
	clients: TestClient[],
): Promise<void> {
	const makeClient = (roomId: string, userId: number): TestClient => {
		const client = new TestClient(roomId, userId);
		clients.push(client);
		return client;
	};
	let rspNow = 0;
	const rspCapture: { persisted?: PersistedMatchContext } = {};
	const rspMessages: GameServerMessage[] = [];
	const rspRoom = await createRoomFromRules({
		roomId: 'ws-reconnect-rsp',
		mode: 'rsp',
		rules: { map: 'rsp', target_score: 21 },
		seed: 42,
		participants: [
			{ userId: 501, slot: 0 },
			{ userId: 502, slot: 1 },
		],
		humanSlots: [0, 1],
		now: () => rspNow,
		onBroadcast: (message) => rspMessages.push(message),
		persistMatch: async (context) => {
			rspCapture.persisted = context;
			return null;
		},
		log: { info: () => {}, warn: () => {} },
	});
	const rspA = makeClient(rspRoom.roomId, 501);
	const rspB = makeClient(rspRoom.roomId, 502);
	await Promise.all([rspA.open(), rspB.open()]);
	rspA.send({ t: 'join' });
	rspB.send({ t: 'join' });
	await Promise.all([
		rspA.waitFor(() => Boolean(rspA.find('welcome')), 'RSP A welcome', bad),
		rspB.waitFor(() => Boolean(rspB.find('welcome')), 'RSP B welcome', bad),
	]);
	rspNow += 3_000;
	rspRoom.pump();
	if (rspRoom.getState() !== 'playing') bad.push(`RSP がplayingにならない (${rspRoom.getState()})`);

	// 通常closeは即AI代替+grace。30秒以内なら同一userがplayer復帰できる。
	rspA.close();
	await rspB.waitFor(
		() =>
			rspB.received.some(
				(message) =>
					message.t === 'player_status' &&
					message.d.slot === 0 &&
					message.d.state === 'grace',
			),
		'RSP slot0 grace',
		bad,
	);
	if (rspRoom.getPlayerSeatState(0) !== 'grace') bad.push('RSP slot0 がgraceにならない');
	const rspAResume = makeClient(rspRoom.roomId, 501);
	await rspAResume.open();
	rspAResume.send({ t: 'join' });
	await rspAResume.waitFor(() => Boolean(rspAResume.find('welcome')), 'RSP resume welcome', bad);
	const resumedWelcome = rspAResume.find('welcome');
	if (resumedWelcome?.d.resume !== true) bad.push('grace内復帰のwelcome.resumeがtrueでない');
	await rspAResume.waitFor(
		() => rspAResume.received.some((message) => message.t === 'snapshot'),
		'RSP resume snapshot',
		bad,
	);
	if (rspRoom.getPlayerSeatState(0) !== 'connected') {
		bad.push('RSP slot0 がconnectedへ復帰しない');
	}
	if (
		!rspB.received.some(
			(message) =>
				message.t === 'event' &&
				message.d.kind === 'player_reconnected' &&
				message.d.slot === 0,
		)
	) {
		bad.push('player_reconnectedが他playerへ届かない');
	}

	// 再切断後、29.999秒ではgrace、30秒ちょうどでAI確定・復帰拒否。
	rspAResume.close();
	await rspB.waitFor(
		() =>
			rspB.received.filter(
				(message) =>
					message.t === 'event' &&
					message.d.kind === 'player_disconnected' &&
					message.d.slot === 0,
			).length >= 2,
		'RSP second disconnect',
		bad,
	);
	rspNow += 29_999;
	rspRoom.pump();
	if (rspRoom.getPlayerSeatState(0) !== 'grace') bad.push('RSP graceが30秒未満で満了した');
	rspNow += 1;
	// pumpと再joinが同時刻に競合しても、join側が期限を再確認してplayer復帰を拒否する。
	const rspLate = makeClient(rspRoom.roomId, 501);
	await rspLate.open();
	rspLate.send({ t: 'join' });
	await rspLate.waitFor(() => rspLate.closedWith !== null, 'RSP late reconnect close', bad);
	if (rspLate.closedWith !== WS_CLOSE.notAllowed) {
		bad.push(`grace満了後のplayer復帰がclose 4003でない (${rspLate.closedWith})`);
	}
	if (rspRoom.getPlayerSeatState(0) !== 'ai') bad.push('RSP grace満了でAI確定しない');
	if (!rspRoom.getAbandonedSlots().includes(0)) bad.push('RSP grace満了席がabandonedでない');

	// 残る人間もgrace満了するとRSPはabandon終了。
	rspB.close();
	await rspB.waitFor(() => rspB.closedWith !== null, 'RSP B close', bad);
	await rspB.waitFor(
		() => rspRoom.getPlayerSeatState(1) === 'grace',
		'RSP slot1 disconnect state',
		bad,
	);
	rspNow += 30_000;
	rspRoom.pump();
	await flushPromises();
	const rspEnd = rspMessages.find(
		(message) => message.t === 'event' && message.d.kind === 'match_end',
	);
	if (
		!rspEnd ||
		rspEnd.t !== 'event' ||
		rspEnd.d.kind !== 'match_end' ||
		rspEnd.d.reason !== 'abandon' ||
		rspEnd.d.winner !== null
	) {
		bad.push('RSP全participant満了がwinner=null/reason=abandonにならない');
	}
	if (rspCapture.persisted?.abandonedSlots.join(',') !== '0,1') {
		bad.push(`RSP abandonedSlotsが不正 (${rspCapture.persisted?.abandonedSlots.join(',')})`);
	}
	closeRoom(rspRoom.roomId);

	// FPSはgrace中も続行し、30秒満了した側がlose・反対slotがforfeit勝者。
	let fpsNow = 0;
	const fpsCapture: { persisted?: PersistedMatchContext } = {};
	const fpsMessages: GameServerMessage[] = [];
	const fpsRoom = await createRoomFromRules({
		roomId: 'ws-reconnect-fps',
		mode: 'fps',
		rules: { map: 'fps_duel' },
		seed: 42,
		participants: [
			{ userId: 601, slot: 0 },
			{ userId: 602, slot: 1 },
		],
		humanSlots: [0, 1],
		now: () => fpsNow,
		onBroadcast: (message) => fpsMessages.push(message),
		persistMatch: async (context) => {
			fpsCapture.persisted = context;
			return null;
		},
		log: { info: () => {}, warn: () => {} },
	});
	const fpsA = makeClient(fpsRoom.roomId, 601);
	const fpsB = makeClient(fpsRoom.roomId, 602);
	await Promise.all([fpsA.open(), fpsB.open()]);
	fpsA.send({ t: 'join' });
	fpsB.send({ t: 'join' });
	await Promise.all([
		fpsA.waitFor(() => Boolean(fpsA.find('welcome')), 'FPS A welcome', bad),
		fpsB.waitFor(() => Boolean(fpsB.find('welcome')), 'FPS B welcome', bad),
	]);
	fpsNow += 3_000;
	fpsRoom.pump();
	fpsA.close();
	await fpsB.waitFor(
		() =>
			fpsB.received.some(
				(message) =>
					message.t === 'player_status' &&
					message.d.slot === 0 &&
					message.d.state === 'grace',
			),
		'FPS slot0 grace',
		bad,
	);
	fpsNow += 29_999;
	fpsRoom.pump();
	if (fpsRoom.getState() !== 'playing') bad.push('FPSがgrace 30秒未満で終了した');
	fpsNow += 1;
	fpsRoom.pump();
	await flushPromises();
	await fpsB.waitFor(
		() =>
			fpsB.received.some(
				(message) =>
					message.t === 'event' &&
					message.d.kind === 'ai_takeover' &&
					message.d.slot === 0,
			),
		'FPS grace ai_takeover',
		bad,
	);
	const fpsEnd = fpsMessages.find(
		(message) => message.t === 'event' && message.d.kind === 'match_end',
	);
	if (
		!fpsEnd ||
		fpsEnd.t !== 'event' ||
		fpsEnd.d.kind !== 'match_end' ||
		fpsEnd.d.reason !== 'forfeit' ||
		fpsEnd.d.winner !== 1
	) {
		bad.push('FPS grace満了がopponent winner/reason=forfeitにならない');
	}
	if (fpsCapture.persisted?.abandonedSlots.join(',') !== '0') {
		bad.push(`FPS abandonedSlotsが不正 (${fpsCapture.persisted?.abandonedSlots.join(',')})`);
	}
	fpsB.close();
	closeRoom(fpsRoom.roomId);

	// 明示leaveは30秒を待たず、FPSを即forfeitで終了する。
	let leaveNow = 0;
	const leaveMessages: GameServerMessage[] = [];
	const leaveRoom = await createRoomFromRules({
		roomId: 'ws-leave-fps',
		mode: 'fps',
		rules: { map: 'fps_duel' },
		seed: 42,
		participants: [
			{ userId: 611, slot: 0 },
			{ userId: 612, slot: 1 },
		],
		humanSlots: [0, 1],
		now: () => leaveNow,
		onBroadcast: (message) => leaveMessages.push(message),
		log: { info: () => {}, warn: () => {} },
	});
	const leaveA = makeClient(leaveRoom.roomId, 611);
	const leaveB = makeClient(leaveRoom.roomId, 612);
	await Promise.all([leaveA.open(), leaveB.open()]);
	leaveA.send({ t: 'join' });
	leaveB.send({ t: 'join' });
	await Promise.all([
		leaveA.waitFor(() => Boolean(leaveA.find('welcome')), 'leave A welcome', bad),
		leaveB.waitFor(() => Boolean(leaveB.find('welcome')), 'leave B welcome', bad),
	]);
	leaveNow += 3_000;
	leaveRoom.pump();
	leaveA.send({ t: 'leave' });
	await leaveB.waitFor(
		() =>
			leaveB.received.some(
				(message) =>
					message.t === 'event' &&
					message.d.kind === 'match_end' &&
					message.d.reason === 'forfeit',
			),
		'FPS explicit leave forfeit',
		bad,
	);
	const leaveEnd = leaveMessages.find(
		(message) => message.t === 'event' && message.d.kind === 'match_end',
	);
	if (
		!leaveEnd ||
		leaveEnd.t !== 'event' ||
		leaveEnd.d.kind !== 'match_end' ||
		leaveEnd.d.reason !== 'forfeit' ||
		leaveEnd.d.winner !== 1
	) {
		bad.push('FPS明示leaveが即時opponent winner/reason=forfeitにならない');
	}
	leaveA.close();
	leaveB.close();
	closeRoom(leaveRoom.roomId);

	// 開始前10秒に未接続でAI化されたparticipantは、playing後に初回joinできない。
	let lateInitialNow = 0;
	const lateInitialRoom = await createRoomFromRules({
		roomId: 'ws-late-initial-rsp',
		mode: 'rsp',
		rules: { map: 'rsp', target_score: 21 },
		seed: 42,
		participants: [
			{ userId: 621, slot: 0 },
			{ userId: 622, slot: 1 },
		],
		humanSlots: [0, 1],
		now: () => lateInitialNow,
		log: { info: () => {}, warn: () => {} },
	});
	const lateInitialA = makeClient(lateInitialRoom.roomId, 621);
	await lateInitialA.open();
	lateInitialA.send({ t: 'join' });
	await lateInitialA.waitFor(
		() => Boolean(lateInitialA.find('welcome')),
		'late initial A welcome',
		bad,
	);
	lateInitialNow += 10_000;
	lateInitialRoom.pump();
	lateInitialNow += 3_000;
	lateInitialRoom.pump();
	if (lateInitialRoom.getState() !== 'playing') {
		bad.push(`late-initial roomがplayingでない (${lateInitialRoom.getState()})`);
	}
	const lateInitialB = makeClient(lateInitialRoom.roomId, 622);
	await lateInitialB.open();
	lateInitialB.send({ t: 'join' });
	await lateInitialB.waitFor(() => lateInitialB.closedWith !== null, 'late initial B close', bad);
	if (lateInitialB.closedWith !== WS_CLOSE.notAllowed) {
		bad.push(`playing後の初回joinがclose 4003でない (${lateInitialB.closedWith})`);
	}
	lateInitialA.close();
	closeRoom(lateInitialRoom.roomId);

	for (const client of clients) {
		if (client.connectionErrors.length > 0) {
			bad.push(`user ${client.userId} にWebSocket error (${client.connectionErrors.length}件)`);
		}
	}
}

/** pending async永続化を2段ぶん進める */
async function flushPromises(): Promise<void> {
	await Promise.resolve();
	await Promise.resolve();
}

/* ── 検査4: W-14 マップ API とテキスト配布の一致 ─────────────────── */

async function checkMaps(baseUrl: string): Promise<string[]> {
	const bad: string[] = [];

	// ③ §2-E: GET /api/maps は一覧（メタデータ）を返す。**本文は含まない**
	const all = (await (await fetch(`${baseUrl}/api/maps`)).json()) as unknown[];
	const rsp = (await (await fetch(`${baseUrl}/api/maps?mode=rsp`)).json()) as { id: string; mode: string }[];
	const badMode = await fetch(`${baseUrl}/api/maps?mode=nope`);
	console.log(`  GET /api/maps → ${all.length}件 / ?mode=rsp → ${rsp.length}件 / ?mode=nope → ${badMode.status}`);

	if (all.length !== 4) bad.push(`ホワイトリストが4件でない (${all.length})`);
	if (rsp.length !== 2 || rsp.some((m) => m.mode !== 'rsp')) bad.push('mode フィルタが効いていない');
	if (badMode.status !== 400) bad.push(`不正な mode が 400 にならない (${badMode.status})`);
	if (all.some((m) => 'path' in (m as object))) bad.push('API がサーバ内部の path を漏らしている');

	// **W-14 の受入条件**: サーバのロード内容と配布テキストが常に一致する。
	// ルームを ID から作り、welcome.map_text が同じ .cub であることを確かめる
	for (const meta of listMaps()) {
		const room = await createRoomFromRules({
			roomId: `map-${meta.id}`,
			mode: meta.mode,
			rules: { map: meta.id },
			seed: 42,
			participants: [{ userId: 400, slot: 0 }],
			log: { info: () => {}, warn: () => {} },
		});
		const expected = loadMapText(meta.id).text;
		if (room.describe().mapText !== expected) {
			bad.push(`${meta.id}: welcome.map_text がロード内容と一致しない`);
		}
	}
	console.log(`  4マップとも welcome.map_text = サーバがロードした .cub と一致 ✓`);

	// ホワイトリストに無い ID は解決しない（任意パス読み出しの防止）
	try {
		await createRoomFromRules({ roomId: 'map-evil', mode: 'rsp', rules: { map: '../../etc/passwd' } });
		bad.push('ホワイトリスト外の ID が通ってしまった');
	} catch {
		console.log('  ホワイトリスト外の ID は拒否される ✓');
	}

	// モード違いのマップは弾く（FPS 用マップで RSP ルームは作れない）
	try {
		await createRoomFromRules({ roomId: 'map-mismatch', mode: 'rsp', rules: { map: 'fps_duel' } });
		bad.push('モード違いのマップが通ってしまった');
	} catch {
		console.log('  モード違いのマップは拒否される ✓');
	}

	return bad;
}

/* ── 実行 ─────────────────────────────────────────────────────── */

async function main(): Promise<void> {
	process.env.NODE_ENV = 'development';
	process.env.ALLOW_DEV_AUTH = 'true';
	const app = await buildServer();
	app.log.level = 'silent';
	await app.listen({ port: PORT, host: '127.0.0.1' });

	console.log('検査1: 2クライアントで対人戦が成立する');
	const bad1 = await checkTwoClientsPlay();
	console.log(bad1.length ? `  NG:\n    ${bad1.join('\n    ')}` : '  OK');

	console.log('\n検査2: 受入条件 №6（不正メッセージ）');
	const bad2 = await checkInvalidMessages();
	console.log(bad2.length ? `  NG:\n    ${bad2.join('\n    ')}` : '  OK: 9項目すべて仕様どおり');

	console.log('\n検査3: W-12 切断・再接続・AI代替');
	const bad3 = await checkReconnectAndForfeit();
	console.log(bad3.length ? `  NG:\n    ${bad3.join('\n    ')}` : '  OK: grace復帰・AI代替・abandon・forfeit');

	console.log('\n検査4: W-14 マップ API とテキスト配布の一致');
	const bad4 = await checkMaps(`http://127.0.0.1:${PORT}`);
	console.log(bad4.length ? `  NG:\n    ${bad4.join('\n    ')}` : '  OK');

	closeAllRooms();
	await app.close();

	if (bad1.length || bad2.length || bad3.length || bad4.length) {
		console.error('\nW-11 / W-12 / W-14: 失敗');
		process.exit(1);
	}
	console.log('\nW-11: 受入条件 №5 / №6 を満たしています');
	console.log('W-12: 受入条件 №4 を満たしています');
	console.log('W-14: マップ一覧とテキスト配布の一致を確認しました');
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
