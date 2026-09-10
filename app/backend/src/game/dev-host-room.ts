// #113 / #171 のレビュー動線。**起動中の開発サーバに対して**ホスト役を肩代わりし、
// GameView（`/game/:roomId`）をブラウザで開ける状態を作る。
// 実行: npm run dev:room  （別ターミナルで `npm run dev` を動かしておくこと）
//
// なぜ要るか: マッチング画面（#111）と GV-08（#87）が未マージのため、いまのフロントには
// `room_start` を送る導線も `match_found` → `/game/:roomId` の遷移も無い。
// その状態で `/game/<適当な id>` を直接開くと、サーバに room が無いので
// ゲーム WS が close 4002 を返し、GameView が 800ms 後にロビーへ戻してしまう
// （`app/frontend/src/pages/GameView.tsx` の close 到達時フォールバック）。
// バックエンドを落として回避することもできない。DEV では `/game/:roomId` が
// `DevSession` の内側にあり、セッションを作れないと GameView 自体が描画されない。
//
// **#111 / #87 がマージされたらこのファイルは不要になる。** その時点で消すこと。
//
// 使い方:
//   1. このスクリプトが部屋コードを表示する
//   2. ブラウザで `/lobby/join` にそのコードを入れて参加する
//   3. このスクリプトで Enter を押す → `room_start`（空席は AI が埋める）
//   4. 表示された `/game/<room_id>` をブラウザで開く
import { createInterface } from 'node:readline/promises';

import WebSocket from 'ws';
import {
	lobbyServerMessageSchema,
	type LobbyClientMessage,
	type LobbyMode,
	type LobbyServerMessage,
} from '@ft/shared';

const backendPort = process.env.BACKEND_PORT ?? '3000';
const frontendPort = process.env.FRONTEND_PORT ?? '5173';
const BACKEND = `http://127.0.0.1:${backendPort}`;
const WEB = `http://localhost:${frontendPort}`;
/** `npm run dev:room -- fps` で FPS の部屋を作る */
const MODE: LobbyMode = process.argv[2] === 'fps' ? 'fps' : 'rsp';
const WAIT_MS = 10_000;

/**
 * Origin 検査（B-05）を通す Origin を実測で選ぶ。
 *
 * `ALLOWED_ORIGIN` は compose では `https://localhost`（nginx 経由）だが、
 * `npm run dev` では Vite の `http://localhost:5173` から来る。未設定なら
 * `isAllowedOrigin` の loopback fallback が効く。どれが有効かは `.env` 次第なので
 * 決め打ちせず、201 が返った方を採用する。
 */
async function signupHost(): Promise<{ origin: string; cookie: string }> {
	const stamp = Date.now();
	const displayName = `roomhost${String(stamp).slice(-5)}`;
	const failures: string[] = [];
	for (const origin of [WEB, 'https://localhost']) {
		let res: Response;
		try {
			res = await fetch(`${BACKEND}/api/auth/signup`, {
				method: 'POST',
				headers: { 'content-type': 'application/json', origin },
				body: JSON.stringify({
					email: `${displayName}.${stamp}@example.test`,
					password: 'correct-horse-battery',
					display_name: displayName,
				}),
			});
		} catch {
			// fetch の接続失敗は `TypeError: fetch failed` としか言わないので、
			// 何を確かめればよいかをここで足す（大半は dev サーバの起動忘れ）
			throw new Error(
				`${BACKEND} へ接続できなかった。別ターミナルで \`npm run dev\` を起動しておくこと。`,
			);
		}
		if (res.status === 201) {
			const setCookie = res.headers.get('set-cookie');
			if (!setCookie) throw new Error('signup が session cookie を発行していない');
			return { origin, cookie: setCookie.split(';')[0] as string };
		}
		failures.push(`${origin} → ${res.status}`);
	}
	throw new Error(
		`ホスト役の signup がどの Origin でも通らなかった（${failures.join(' / ')}）。\n` +
			'`.env` の ALLOWED_ORIGIN と、バックエンドが起動しているかを確認すること。',
	);
}

/** ロビー WS の1接続。受信は共有スキーマで検証してから配る（独自の wire type を作らない） */
class LobbyClient {
	private readonly socket: WebSocket;
	private readonly waiters: ((message: LobbyServerMessage) => void)[] = [];

	constructor(origin: string, cookie: string) {
		this.socket = new WebSocket(`${BACKEND.replace(/^http/, 'ws')}/ws/lobby`, {
			headers: { origin, cookie },
		});
		this.socket.on('message', (raw: Buffer) => {
			const parsed = lobbyServerMessageSchema.safeParse(JSON.parse(raw.toString('utf8')));
			if (!parsed.success) return;
			if (parsed.data.t === 'error') {
				console.error('サーバからのエラー:', JSON.stringify(parsed.data.d));
			}
			for (const waiter of this.waiters.slice()) waiter(parsed.data);
		});
		this.socket.on('close', (code: number, reason: Buffer) => {
			console.error(`ロビー WS が切断された code=${code} ${reason.toString('utf8')}`);
			process.exit(1);
		});
	}

	open(): Promise<void> {
		return new Promise((resolve, reject) => {
			this.socket.once('open', () => resolve());
			this.socket.once('error', reject);
		});
	}

	send(message: LobbyClientMessage): void {
		this.socket.send(JSON.stringify(message));
	}

	/** 指定種別が届くまで待つ。届かないまま WAIT_MS 過ぎたら諦める */
	waitFor<T extends LobbyServerMessage['t']>(
		type: T,
	): Promise<Extract<LobbyServerMessage, { t: T }>> {
		return new Promise((resolve, reject) => {
			const timer = setTimeout(() => {
				this.waiters.splice(this.waiters.indexOf(waiter), 1);
				reject(new Error(`${type} が ${WAIT_MS}ms 以内に届かなかった`));
			}, WAIT_MS);
			const waiter = (message: LobbyServerMessage): void => {
				if (message.t !== type) return;
				clearTimeout(timer);
				this.waiters.splice(this.waiters.indexOf(waiter), 1);
				resolve(message as Extract<LobbyServerMessage, { t: T }>);
			};
			this.waiters.push(waiter);
		});
	}
}

function banner(lines: string[]): void {
	const rule = '='.repeat(60);
	console.log(`\n${rule}\n${lines.map((l) => `  ${l}`).join('\n')}\n${rule}\n`);
}

async function main(): Promise<void> {
	const { origin, cookie } = await signupHost();
	console.log(`ホスト役でログインした（Origin=${origin}）`);

	const lobby = new LobbyClient(origin, cookie);
	await lobby.open();
	await lobby.waitFor('lobby_hello');

	lobby.send({ t: 'room_create', d: { mode: MODE } });
	const created = await lobby.waitFor('room_state');
	banner([
		`部屋コード: ${created.d.code}（${MODE.toUpperCase()}）`,
		`ブラウザで ${WEB}/lobby/join に入力して参加する`,
	]);

	const rl = createInterface({ input: process.stdin, output: process.stdout });
	await rl.question('ブラウザで参加できたら Enter を押す… ');
	rl.close();

	lobby.send({ t: 'room_start', d: {} });
	const found = await lobby.waitFor('match_found');
	banner([
		`room_id: ${found.d.room_id}`,
		`ここを開く → ${WEB}/game/${found.d.room_id}`,
	]);

	// ホスト席にも実際に join しておく。こうすると「予定していた人間席が全部埋まった」
	// 判定が働いて 10 秒の join 待ちを待たずにカウントダウンへ入り、レビュワーからは
	// 対戦相手（棒立ち）が見える。繋がないままでも 10 秒後に試合は始まる
	const game = new WebSocket(
		`${BACKEND.replace(/^http/, 'ws')}/ws/game/${encodeURIComponent(found.d.room_id)}`,
		{ headers: { origin, cookie } },
	);
	game.on('open', () => game.send(JSON.stringify({ t: 'join', d: {} })));
	game.on('close', (code: number, reason: Buffer) => {
		console.log(`ホスト席のゲーム WS が切断された code=${code} ${reason.toString('utf8')}`);
	});
	console.log('試合中はこのプロセスを開いたままにする（Ctrl-C で終了）');
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
