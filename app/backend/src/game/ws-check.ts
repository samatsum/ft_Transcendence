// W-11 の確認用エントリ。**ブラウザを使わず**に受入条件を検証する。
// 実行: npx tsx app/backend/src/game/ws-check.ts
//
// 検査1: 対人戦の疎通 — 2クライアントが join → welcome → input → snapshot → match_end
// 検査2: ② §10 受入条件 №6 — 不正メッセージ4種がそれぞれ仕様どおりに扱われる
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import WebSocket from 'ws';
import { WS_CLOSE, type GameServerMessage } from '@ft/shared';

import { buildServer } from '../index.js';
import { closeAllRooms, createRoom } from './rooms.js';

const PORT = 3999;
const MAP = 'rsp_map/rsp.cub';
const TICK_HZ = 30;

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
	closedWith: number | null = null;
	private readonly ws: WebSocket;

	constructor(roomId: string, readonly userId: number) {
		this.ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws/game/${roomId}`, {
			headers: { 'x-dev-user': String(userId) },
		});
		this.ws.on('message', (data) => {
			const parsed = JSON.parse(String(data)) as GameServerMessage | { t: 'error'; d: { code: string; msg: string } };
			if (parsed.t === 'error') this.errors.push(parsed.d);
			else this.received.push(parsed);
		});
		this.ws.on('close', (code) => {
			this.closedWith = code;
		});
	}

	async open(): Promise<void> {
		if (this.ws.readyState === WebSocket.OPEN) return;
		await new Promise<void>((resolve, reject) => {
			this.ws.once('open', resolve);
			this.ws.once('error', reject);
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

	close(): void {
		this.ws.close();
	}
}

/* ── 検査1: 2クライアントで対人戦が成立する ─────────────────────── */

async function checkTwoClientsPlay(): Promise<string[]> {
	const bad: string[] = [];
	const room = await createRoom({
		roomId: 'ws-play',
		cubText: loadMap(),
		mode: 'rsp',
		targetScore: 1, // 実時間で回すので短く
		seed: 42,
		// ② §4-C の participant 登録。userId 101 → slot 0 / 102 → slot 1
		participants: [
			{ userId: 101, slot: 0 },
			{ userId: 102, slot: 1 },
		],
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

	c5.close();
	return bad;
}

/* ── 実行 ─────────────────────────────────────────────────────── */

async function main(): Promise<void> {
	const app = await buildServer();
	app.log.level = 'silent';
	await app.listen({ port: PORT, host: '127.0.0.1' });

	console.log('検査1: 2クライアントで対人戦が成立する');
	const bad1 = await checkTwoClientsPlay();
	console.log(bad1.length ? `  NG:\n    ${bad1.join('\n    ')}` : '  OK');

	console.log('\n検査2: 受入条件 №6（不正メッセージ）');
	const bad2 = await checkInvalidMessages();
	console.log(bad2.length ? `  NG:\n    ${bad2.join('\n    ')}` : '  OK: 7項目すべて仕様どおり');

	closeAllRooms();
	await app.close();

	if (bad1.length || bad2.length) {
		console.error('\nW-11: 失敗');
		process.exit(1);
	}
	console.log('\nW-11: 受入条件 №5 / №6 を満たしています');
}

main().catch((err: unknown) => {
	console.error(err);
	process.exit(1);
});
