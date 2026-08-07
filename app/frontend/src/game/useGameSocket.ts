// ゲーム WS（/ws/game/:roomId）のクライアントフック（F-06 / ④ §4）。
//
// 責務:
//   - 接続・自動再接続（在ゲーム中は W-12 の 30秒 grace 内で復帰）
//   - 受信メッセージの zod 検証（コンソールゼロ運用: エラーはコンソール出力せず開発ログへ）
//   - welcome を1回だけ、snapshot をリングバッファに蓄積、event/player_status を dispatch
//   - 送信は状態機械が open のときだけ通す
//
// 契約の正本は ② §5・§7 と `app/shared/src/ws/game.ts`。ここではワイヤ検証と
// バッファ・状態管理のみを持ち、補間・描画・入力は別フックへ切る。

import { useCallback, useEffect, useRef, useState } from 'react';
import {
	WS_CLOSE,
	envelopeSchema,
	gameEventSchema,
	gameServerMessageSchema,
	playerStatusMessageSchema,
	snapshotMessageSchema,
	welcomeMessageSchema,
	type GameClientMessage,
	type GameEvent,
	type PlayerStatusMessage,
	type SnapshotPayload,
	type WelcomeMessage,
} from '@ft/shared';

/** 受信 snapshot に到着時刻（performance.now ミリ秒）を紐づけて保持する */
export interface TimedSnapshot {
	receivedAtMs: number;
	payload: SnapshotPayload;
}

export type GameSocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface UseGameSocketResult {
	status: GameSocketStatus;
	welcome: WelcomeMessage['d'] | null;
	/**
	 * 直近 8 枚の snapshot リング。**ref で公開する**（15Hz 再レンダ回避）。
	 * 100ms 遅延の2点補間には2〜3枚あれば足りるが、猶予として持つ
	 */
	snapshotBufferRef: { current: TimedSnapshot[] };
	/** 直近 event。演出用（正本は snapshot） */
	lastEvent: GameEvent['d'] | null;
	/** slot → 席状態（connected/ai/grace） */
	playerStatus: Map<number, PlayerStatusMessage['d']['state']>;
	/** close コード（4002=room無, 4004=置換 など。② §2-B） */
	closeCode: number | null;
	/** true になっていれば送信可 */
	canSend: boolean;
	send: (msg: GameClientMessage) => void;
}

const SNAPSHOT_BUFFER_MAX = 8;

// close コード → 再接続するかの判定（② §7-A: 通常断は再接続、明示 close は再接続しない）
function shouldReconnect(code: number): boolean {
	if (code === WS_CLOSE.normal) return false; // 1000: 意図的な切断
	if (code === WS_CLOSE.unauthenticated) return false; // 4000
	if (code === WS_CLOSE.roomNotFound) return false; // 4002
	if (code === WS_CLOSE.notAllowed) return false; // 4003
	if (code === WS_CLOSE.replaced) return false; // 4004
	return true;
}

function buildWsUrl(roomId: string): string {
	const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${proto}//${window.location.host}/ws/game/${encodeURIComponent(roomId)}`;
}

export function useGameSocket(roomId: string): UseGameSocketResult {
	const [status, setStatus] = useState<GameSocketStatus>('connecting');
	const [welcome, setWelcome] = useState<WelcomeMessage['d'] | null>(null);
	const snapshotBufferRef = useRef<TimedSnapshot[]>([]);
	const [lastEvent, setLastEvent] = useState<GameEvent['d'] | null>(null);
	const [playerStatus, setPlayerStatus] = useState<Map<number, PlayerStatusMessage['d']['state']>>(
		() => new Map(),
	);
	const [closeCode, setCloseCode] = useState<number | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const attemptRef = useRef(0);
	const teardownRef = useRef(false);

	useEffect(() => {
		teardownRef.current = false;
		// CodeRabbit 指摘#4: roomId 変更で新規セッション扱いにするため
		// backoff counter をリセット
		attemptRef.current = 0;
		// CodeRabbit 指摘（追加）: roomId 変更で前 room のデータが一瞬でも
		// 描画されないよう welcome / snapshot バッファ / player_status / lastEvent もクリア
		setWelcome(null);
		snapshotBufferRef.current.length = 0;
		setLastEvent(null);
		setPlayerStatus(new Map());
		setCloseCode(null);
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

		function connect() {
			// 再接続時にも「切断されました」バナーが残らないよう、接続開始で closeCode を戻す
			setCloseCode(null);
			setStatus(attemptRef.current === 0 ? 'connecting' : 'reconnecting');
			const ws = new WebSocket(buildWsUrl(roomId));
			wsRef.current = ws;

			ws.onopen = () => {
				attemptRef.current = 0;
				setStatus('open');
				// ② §5-A: join のペイロードは Cookie 認証と participant 登録で本人確定するので空
				ws.send(JSON.stringify({ t: 'join', d: {} }));
			};

			ws.onmessage = (ev: MessageEvent<string>) => {
				let raw: unknown;
				try {
					raw = JSON.parse(ev.data);
				} catch {
					return; // 開発ログへ落とすのは今後の TODO（コンソールゼロ運用）
				}
				const env = envelopeSchema.safeParse(raw);
				if (!env.success) return;
				switch (env.data.t) {
					case 'welcome': {
						const w = welcomeMessageSchema.safeParse(raw);
						if (w.success) setWelcome(w.data.d);
						return;
					}
					case 'snapshot': {
						const s = snapshotMessageSchema.safeParse(raw);
						if (!s.success) return;
						const timed: TimedSnapshot = {
							receivedAtMs: performance.now(),
							payload: s.data.d,
						};
						const buf = snapshotBufferRef.current;
						buf.push(timed);
						if (buf.length > SNAPSHOT_BUFFER_MAX) {
							buf.splice(0, buf.length - SNAPSHOT_BUFFER_MAX);
						}
						return;
					}
					case 'event': {
						const e = gameEventSchema.safeParse(raw);
						if (e.success) setLastEvent(e.data.d);
						return;
					}
					case 'player_status': {
						const p = playerStatusMessageSchema.safeParse(raw);
						if (!p.success) return;
						setPlayerStatus((prev) => {
							const next = new Map(prev);
							next.set(p.data.d.slot, p.data.d.state);
							return next;
						});
						return;
					}
					default: {
						// discriminated union の網羅チェック（gameServerMessageSchema）は
						// error などを含めた safeParse で握るのみ（受入 №6）
						gameServerMessageSchema.safeParse(raw);
					}
				}
			};

			ws.onclose = (ev: CloseEvent) => {
				setCloseCode(ev.code);
				wsRef.current = null;
				if (teardownRef.current || !shouldReconnect(ev.code)) {
					setStatus('closed');
					return;
				}
				setStatus('reconnecting');
				// ④ §4: 1s → 2s → 5s（上限）の指数バックオフ
				const delays = [1000, 2000, 5000];
				const delay = delays[Math.min(attemptRef.current, delays.length - 1)];
				attemptRef.current += 1;
				reconnectTimer = setTimeout(connect, delay);
			};

			ws.onerror = () => {
				// error は close を必ず伴うので、ここでは何もしない（onclose で扱う）
			};
		}

		connect();

		return () => {
			teardownRef.current = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			const ws = wsRef.current;
			wsRef.current = null;
			if (ws && ws.readyState <= WebSocket.OPEN) ws.close(WS_CLOSE.normal);
		};
	}, [roomId]);

	// CodeRabbit 指摘#5: send を useCallback で安定化。これがないと
	// useGameSocket の state 更新（lastEvent/playerStatus 等）ごとに
	// send の identity が変わり、useGameInput の setInterval effect が
	// 再セットされて 30Hz 送信が毎回リセットされる。ws は ref 参照なので
	// deps 空でも常に最新の接続を使う
	const send = useCallback((msg: GameClientMessage) => {
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		ws.send(JSON.stringify(msg));
	}, []);

	return {
		status,
		welcome,
		snapshotBufferRef,
		lastEvent,
		playerStatus,
		closeCode,
		canSend: status === 'open',
		send,
	};
}
