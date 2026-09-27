// ゲーム WS（/ws/game/:roomId）のクライアントフック（GV-06 / ④ §4）。
//
// 責務:
//   - 接続・自動再接続（在ゲーム中は B-12 の 30秒 grace 内で復帰）
//   - 受信メッセージの zod 検証（コンソールゼロ運用: エラーはコンソール出力せず開発ログへ）
//   - welcome を1回だけ、snapshot をリングバッファに蓄積、event/player_status を dispatch
//   - 送信は状態機械が open のときだけ通す
//
// 契約の正本は ② §5・§7 と `app/shared/src/ws/game.ts`。ここではワイヤ検証と
// バッファ・状態管理のみを持ち、補間・描画・入力は別フックへ切る。

import { useCallback, useEffect, useRef, useState } from 'react';
import {
	WS_CLOSE,
	type GameClientMessage,
	type GameEvent,
	type PlayerStatusMessage,
	type SnapshotPayload,
	type WelcomeMessage,
} from '@ft/shared';

import { markGameRoomFinished } from './gameRouteState.js';
import { applyWorldSnapshot, createWorldProgress, type WorldProgress } from './worldState.js';
import { handleGameServerMessage } from '../ws/gameMessageHandler.js';
import {
	closeWebSocketOnCleanup,
	deferWebSocketConnection,
} from '../ws/webSocketLifecycle.js';

/** 受信 snapshot に到着時刻（performance.now ミリ秒）を紐づけて保持する */
export interface TimedSnapshot {
	receivedAtMs: number;
	payload: SnapshotPayload;
}

export interface QueuedGameEvent {
	id: number;
	event: GameEvent['d'];
}

export type MatchEndEvent = Extract<GameEvent['d'], { kind: 'match_end' }>;

export function enqueueGameEvent(
	queue: QueuedGameEvent[],
	id: number,
	event: GameEvent['d'],
): QueuedGameEvent[] {
	return [...queue, { id, event }];
}

export function acknowledgeGameEvents(
	queue: QueuedGameEvent[],
	throughId: number,
): QueuedGameEvent[] {
	return queue.filter(({ id }) => id > throughId);
}

export type GameSocketStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';
export type GameLeaveStatus = 'idle' | 'waiting' | 'failed' | 'acknowledged';

export interface UseGameSocketResult {
	status: GameSocketStatus;
	welcome: WelcomeMessage['d'] | null;
	/**
	 * 直近 8 枚の snapshot リング。**ref で公開する**（15Hz 再レンダ回避）。
	 * 100ms 遅延の2点補間には2〜3枚あれば足りるが、猶予として持つ
	 */
	snapshotBufferRef: { current: TimedSnapshot[] };
	/** snapshot 到着順で累積する FPS world 正本。描画と HUD が共用する */
	worldProgressRef: { current: WorldProgress };
	/** HUD が到着順に処理する未確認 event */
	pendingEvents: QueuedGameEvent[];
	/** 決着処理専用（通常の演出 event キューとは別に保持） */
	matchEndEvent: MatchEndEvent | null;
	/** 指定した id までの event を処理済みにする */
	acknowledgeEvents: (throughId: number) => void;
	/** slot → 席状態（connected/ai/grace） */
	playerStatus: Map<number, PlayerStatusMessage['d']['state']>;
	/** close コード（4002=room無, 4004=置換 など。② §2-B） */
	closeCode: number | null;
	leaveStatus: GameLeaveStatus;
	/** true になっていれば送信可 */
	canSend: boolean;
	send: (msg: GameClientMessage) => void;
}

/** RSPはACK後、FPSは従来どおり送信後に画面を離れる */
export function shouldNavigateAfterLeave(
	mode: WelcomeMessage['d']['mode'] | null,
	leaveStatus: GameLeaveStatus,
): boolean {
	return leaveStatus === 'acknowledged' || (mode === 'fps' && leaveStatus === 'waiting');
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

/** 退出確認待ち中は遷移せず、失敗時は正常終了・ルーム消滅のみロビーへ戻す */
export function shouldReturnToLobby(
	code: number | null,
	leaveStatus: GameLeaveStatus = 'idle',
): boolean {
	if (leaveStatus === 'waiting') return false;
	if (leaveStatus === 'failed') {
		return code === WS_CLOSE.normal || code === WS_CLOSE.roomNotFound;
	}
	return (
		code === WS_CLOSE.normal ||
		code === WS_CLOSE.roomNotFound ||
		code === WS_CLOSE.notAllowed
	);
}

function buildWsUrl(roomId: string): string {
	const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${proto}//${window.location.host}/ws/game/${encodeURIComponent(roomId)}`;
}

export function useGameSocket(roomId: string): UseGameSocketResult {
	const [status, setStatus] = useState<GameSocketStatus>('connecting');
	const [welcome, setWelcome] = useState<WelcomeMessage['d'] | null>(null);
	const snapshotBufferRef = useRef<TimedSnapshot[]>([]);
	const worldProgressRef = useRef<WorldProgress>(createWorldProgress());
	const [pendingEvents, setPendingEvents] = useState<QueuedGameEvent[]>([]);
	const [matchEndEvent, setMatchEndEvent] = useState<MatchEndEvent | null>(null);
	const [playerStatus, setPlayerStatus] = useState<Map<number, PlayerStatusMessage['d']['state']>>(
		() => new Map(),
	);
	const [closeCode, setCloseCode] = useState<number | null>(null);
	const [leaveStatus, setLeaveStatus] = useState<GameLeaveStatus>('idle');
	const leavePendingRef = useRef(false);
	const statusRef = useRef<GameSocketStatus>('connecting');
	const wsRef = useRef<WebSocket | null>(null);
	const attemptRef = useRef(0);
	const nextEventIdRef = useRef(1);

	useEffect(() => {
		// StrictMode（開発時）は effect を「実行 → 破棄 → 再実行」する。破棄フラグを
		// コンポーネント共有の ref に置くと、再実行が false に戻した後で中断済み接続の
		// onclose（CONNECTING 中の close は 1006 = 再接続対象）が走り、破棄済みの
		// クロージャから再接続が始まる。結果、同一ユーザー・同一ルームの接続が2本
		// 同時に開き、サーバが古い方を close 4004 で置換する（② §1）。
		// LobbyContext と同じく、実行ごとのローカル変数にする
		let cancelled = false;
		// CodeRabbit 指摘#4: roomId 変更で新規セッション扱いにするため
		// backoff counter をリセット
		attemptRef.current = 0;
		// CodeRabbit 指摘（追加）: roomId 変更で前 room のデータが一瞬でも
		// 描画されないよう welcome / snapshot バッファ / player_status / event もクリア
		setWelcome(null);
		snapshotBufferRef.current.length = 0;
		worldProgressRef.current = createWorldProgress();
		setPendingEvents([]);
		setMatchEndEvent(null);
		setPlayerStatus(new Map());
		setCloseCode(null);
		setLeaveStatus('idle');
		leavePendingRef.current = false;
		statusRef.current = 'connecting';
		nextEventIdRef.current = 1;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

		function connect() {
			if (cancelled) return;
			// 再接続時にも「切断されました」バナーが残らないよう、接続開始で closeCode を戻す
			setCloseCode(null);
			const nextStatus = attemptRef.current === 0 ? 'connecting' : 'reconnecting';
			statusRef.current = nextStatus;
			setStatus(nextStatus);
			const ws = new WebSocket(buildWsUrl(roomId));
			wsRef.current = ws;

			ws.onopen = () => {
				if (cancelled || wsRef.current !== ws) return;
				attemptRef.current = 0;
				statusRef.current = 'open';
				setStatus('open');
				// ② §5-A: join のペイロードは Cookie 認証と participant 登録で本人確定するので空
				ws.send(JSON.stringify({ t: 'join', d: {} }));
			};

			ws.onmessage = (ev: MessageEvent<string>) => {
				if (cancelled || wsRef.current !== ws) return;
				handleGameServerMessage(ev.data, {
				onWelcome: (payload) => {
					setWelcome(payload);
					// leave を受け取る前に切断されていた場合は、grace中の復帰確認後に再送する
					if (leavePendingRef.current) {
						ws.send(JSON.stringify({ t: 'leave', d: {} }));
					}
				},
					onSnapshot: (payload) => {
						const timed: TimedSnapshot = { receivedAtMs: performance.now(), payload };
						const buf = snapshotBufferRef.current;
						buf.push(timed);
						if (buf.length > SNAPSHOT_BUFFER_MAX) {
							buf.splice(0, buf.length - SNAPSHOT_BUFFER_MAX);
						}
						worldProgressRef.current = applyWorldSnapshot(worldProgressRef.current, timed.payload);
					},
					onEvent: (event) => {
						const id = nextEventIdRef.current++;
						setPendingEvents((prev) => enqueueGameEvent(prev, id, event));
						if (event.kind === 'match_end') {
							markGameRoomFinished(roomId);
							setMatchEndEvent(event);
						}
					},
				onPlayerStatus: (payload) => {
						setPlayerStatus((prev) => {
							const next = new Map(prev);
							next.set(payload.slot, payload.state);
							return next;
						});
				},
				onLeaveAck: () => {
					leavePendingRef.current = false;
					setLeaveStatus('acknowledged');
				},
			});
			};

			ws.onclose = (ev: CloseEvent) => {
				// 置換や遅れて届いた close が、張り直した新しい接続の状態を潰さないようにする。
				// `cancelled` は effect ごと破棄された場合、`wsRef.current !== ws` は
				// 同じ effect の中で既に次の接続へ移っている場合を弾く
				if (cancelled || wsRef.current !== ws) return;
				setCloseCode(ev.code);
				wsRef.current = null;
				if (!shouldReconnect(ev.code)) {
					statusRef.current = 'closed';
					if (leavePendingRef.current) setLeaveStatus('failed');
					setStatus('closed');
					return;
				}
				statusRef.current = 'reconnecting';
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

		const cancelInitialConnect = deferWebSocketConnection(connect);

		return () => {
			cancelled = true;
			cancelInitialConnect();
			if (reconnectTimer) clearTimeout(reconnectTimer);
			const ws = wsRef.current;
			wsRef.current = null;
			if (ws) closeWebSocketOnCleanup(ws);
		};
	}, [roomId]);

	// CodeRabbit 指摘#5: send を useCallback で安定化。これがないと
	// useGameSocket の state 更新（pendingEvents/playerStatus 等）ごとに
	// send の identity が変わり、useGameInput の setInterval effect が
	// 再セットされて 30Hz 送信が毎回リセットされる。ws は ref 参照なので
	// deps 空でも常に最新の接続を使う
	const send = useCallback((msg: GameClientMessage) => {
		if (msg.t === 'leave') {
			if (statusRef.current === 'closed') {
				setLeaveStatus('failed');
				return;
			}
			leavePendingRef.current = true;
			setLeaveStatus('waiting');
		}
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) return;
		ws.send(JSON.stringify(msg));
	}, []);

	const acknowledgeEvents = useCallback((throughId: number) => {
		setPendingEvents((prev) => acknowledgeGameEvents(prev, throughId));
	}, []);

	return {
		status,
		welcome,
		snapshotBufferRef,
		worldProgressRef,
		pendingEvents,
		matchEndEvent,
		acknowledgeEvents,
		playerStatus,
		closeCode,
		leaveStatus,
		canSend: status === 'open',
		send,
	};
}
