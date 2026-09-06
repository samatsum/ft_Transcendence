// ロビー WS（/ws/lobby）のクライアント層（F-05 / #134）。
//
// 4画面（部屋画面 / 部屋作成 / 部屋参加 / マッチング）が1本の接続を共有するため、
// フックではなく Context にしている。画面ごとに繋ぎ直すと、誰が接続を持つかで衝突する。
//
// 契約の正本は `app/shared/src/ws/lobby.ts`。ここは接続の維持と受信の仕分けだけを持ち、
// 画面遷移の判断は各画面に委ねる。

import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import {
	WS_CLOSE,
	lobbyServerMessageSchema,
	type LobbyClientMessage,
	type MatchFoundMessage,
	type MatchResultPayload,
	type RoomStatePayload,
} from '@ft/shared';

export type LobbyStatus = 'connecting' | 'open' | 'reconnecting' | 'closed';

export interface LobbyError {
	code: string;
	message: string;
}

interface LobbyContextValue {
	status: LobbyStatus;
	/** ロビーに接続している人数（接続時の lobby_hello が返す値） */
	onlineCount: number;
	/** 直近の room_state。部屋に居ないときは null */
	room: RoomStatePayload | null;
	/** 試合が組まれたら入る。マッチング画面がこれを見て /game/:roomId へ遷移する */
	matchFound: MatchFoundMessage['d'] | null;
	/** 試合結果。ゲーム WS ではなくこの接続に届く */
	matchResult: MatchResultPayload | null;
	/** 直近のサーバ側エラー（room_not_found など） */
	error: LobbyError | null;
	/** 送信。接続が open でなければ false を返す */
	send: (message: LobbyClientMessage) => boolean;
	clearError: () => void;
	/** 部屋を出た直後など、画面側で room を明示的に捨てたいとき */
	clearRoom: () => void;
	/** 待機画面が対戦画面へ遷移したら呼ぶ。残したままだと次の入室で即再遷移する */
	clearMatchFound: () => void;
	/** 結果表示を閉じたら呼ぶ */
	clearMatchResult: () => void;
}

const LobbyContext = createContext<LobbyContextValue | null>(null);

// 再試行しても結果が変わらない切断は、繰り返さない
function shouldReconnect(code: number): boolean {
	if (code === WS_CLOSE.normal) return false; // 1000: 意図的な切断
	if (code === WS_CLOSE.unauthenticated) return false; // 4000: 認証が通っていない
	if (code === WS_CLOSE.protocolViolation) return false; // 4001: 繋ぎ直しても同じ違反を繰り返す
	if (code === WS_CLOSE.notAllowed) return false; // 4003
	if (code === WS_CLOSE.replaced) return false; // 4004: 別タブに乗り換えられた
	return true;
}

function buildWsUrl(): string {
	const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
	return `${proto}//${window.location.host}/ws/lobby`;
}

export function LobbyProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<LobbyStatus>('connecting');
	const [onlineCount, setOnlineCount] = useState(0);
	const [room, setRoom] = useState<RoomStatePayload | null>(null);
	const [matchFound, setMatchFound] = useState<MatchFoundMessage['d'] | null>(null);
	const [matchResult, setMatchResult] = useState<MatchResultPayload | null>(null);
	const [error, setError] = useState<LobbyError | null>(null);

	const wsRef = useRef<WebSocket | null>(null);
	const attemptRef = useRef(0);

	useEffect(() => {
		// StrictMode（開発時）は effect を「実行 → 破棄 → 再実行」する。破棄フラグを
		// コンポーネント共有の ref に置くと、再実行が false に戻した後で古い接続の
		// onclose が走り、不要な再接続が始まってしまう。実行ごとのローカル変数にする
		let cancelled = false;
		let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

		function connect() {
			if (cancelled) return;
			setStatus(attemptRef.current === 0 ? 'connecting' : 'reconnecting');

			const ws = new WebSocket(buildWsUrl());
			wsRef.current = ws;

			ws.onopen = () => {
				if (cancelled) return;
				attemptRef.current = 0;
				setStatus('open');
			};

			ws.onmessage = (ev: MessageEvent<string>) => {
				if (cancelled) return;
				let raw: unknown;
				try {
					raw = JSON.parse(ev.data);
				} catch {
					return; // 壊れた JSON は捨てる（コンソールには出さない）
				}
				const parsed = lobbyServerMessageSchema.safeParse(raw);
				if (!parsed.success) return;

				const msg = parsed.data;
				switch (msg.t) {
					case 'lobby_hello':
						setOnlineCount(msg.d.online_count);
						break;
					case 'presence_update':
						// 「誰か1人の状態が変わった」という通知で、人数は入っていない。
						// 人数が要る画面が出てきたら、ここで自前に数える
						break;
					case 'room_state':
						// 部屋の全員に配られる。参加・退室・設定変更のすべてがこれで届く
						setRoom(msg.d);
						setError(null);
						break;
					case 'match_found':
						setMatchFound(msg.d);
						break;
					case 'match_result':
						setMatchResult(msg.d);
						setRoom(null);
						break;
					case 'error':
						setError({ code: msg.d.code, message: msg.d.msg });
						break;
					default:
						break;
				}
			};

			ws.onclose = (closeEvent: CloseEvent) => {
				if (cancelled) return; // 破棄済みの接続からの通知は無視する
				wsRef.current = null;
				if (!shouldReconnect(closeEvent.code)) {
					setStatus('closed');
					return;
				}
				setStatus('reconnecting');
				// useGameSocket と同じ 1s → 2s → 5s の指数バックオフ
				const delays = [1000, 2000, 5000];
				const delay = delays[Math.min(attemptRef.current, delays.length - 1)];
				attemptRef.current += 1;
				reconnectTimer = setTimeout(connect, delay);
			};

			ws.onerror = () => {
				// error のあとは必ず close が来るので、ここでは何もしない
			};
		}

		connect();

		return () => {
			cancelled = true;
			if (reconnectTimer) clearTimeout(reconnectTimer);
			wsRef.current?.close(WS_CLOSE.normal);
			wsRef.current = null;
		};
	}, []);

	const send = useCallback((message: LobbyClientMessage): boolean => {
		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) return false;
		ws.send(JSON.stringify(message));
		return true;
	}, []);

	const clearError = useCallback(() => setError(null), []);
	const clearRoom = useCallback(() => setRoom(null), []);
	// 遷移や結果表示を終えた画面が呼ぶ。残したままだと、次に同じ画面へ入った瞬間に
	// 古い値で再遷移してしまう
	const clearMatchFound = useCallback(() => setMatchFound(null), []);
	const clearMatchResult = useCallback(() => setMatchResult(null), []);

	const value = useMemo<LobbyContextValue>(
		() => ({
			status,
			onlineCount,
			room,
			matchFound,
			matchResult,
			error,
			send,
			clearError,
			clearRoom,
			clearMatchFound,
			clearMatchResult,
		}),
		[
			status, onlineCount, room, matchFound, matchResult, error, send,
			clearError, clearRoom, clearMatchFound, clearMatchResult,
		],
	);

	return <LobbyContext.Provider value={value}>{children}</LobbyContext.Provider>;
}

export function useLobby(): LobbyContextValue {
	const ctx = useContext(LobbyContext);
	if (!ctx) throw new Error('useLobby は LobbyProvider の内側でのみ使える');
	return ctx;
}
