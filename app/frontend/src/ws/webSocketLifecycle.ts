import { WS_CLOSE } from '@ft/shared';

const WS_CONNECTING = 0;
const WS_OPEN = 1;

/**
 * 初回接続を次のイベントループへ送る
 * StrictMode の試験用 setup は直後に cleanup されるため、socket 自体を生成させない
 */
export function deferWebSocketConnection(connect: () => void): () => void {
	const timer = setTimeout(connect, 0);
	return () => clearTimeout(timer);
}

/** cleanup 時に接続途中の socket をブラウザ警告なしで正常終了する */
export function closeWebSocketOnCleanup(ws: WebSocket): void {
	if (ws.readyState === WS_OPEN) {
		ws.close(WS_CLOSE.normal);
		return;
	}
	if (ws.readyState !== WS_CONNECTING) return;

	// CONNECTING 中の close() は Chrome が警告を出すため handshake 完了後に正常終了する
	ws.addEventListener(
		'open',
		() => {
			if (ws.readyState === WS_OPEN) ws.close(WS_CLOSE.normal);
		},
		{ once: true },
	);
}
