import { afterEach, describe, expect, it, vi } from 'vitest';

import { closeWebSocketOnCleanup, deferWebSocketConnection } from './webSocketLifecycle.js';

afterEach(() => {
	vi.useRealTimers();
});

function createSocket(readyState: number) {
	let openListener: (() => void) | null = null;
	const socket = {
		readyState,
		close: vi.fn(),
		addEventListener: vi.fn((_type: string, listener: () => void) => {
			openListener = listener;
		}),
	};
	return {
		socket: socket as unknown as WebSocket,
		open: () => {
			socket.readyState = 1;
			(openListener as (() => void) | null)?.();
		},
	};
}

describe('WebSocket lifecycle', () => {
	it('StrictMode の cleanup が先に来たら初回接続を生成しない', () => {
		vi.useFakeTimers();
		const connect = vi.fn();

		const cancel = deferWebSocketConnection(connect);
		cancel();
		vi.runAllTimers();

		expect(connect).not.toHaveBeenCalled();
	});

	it('次のイベントループで初回接続を開始する', () => {
		vi.useFakeTimers();
		const connect = vi.fn();

		deferWebSocketConnection(connect);
		expect(connect).not.toHaveBeenCalled();
		vi.runAllTimers();

		expect(connect).toHaveBeenCalledTimes(1);
	});

	it('CONNECTING 中は即時 close せず、open 後に正常終了する', () => {
		const { socket, open } = createSocket(0);

		closeWebSocketOnCleanup(socket);

		expect(socket.close).not.toHaveBeenCalled();
		expect(socket.addEventListener).toHaveBeenCalledWith('open', expect.any(Function), { once: true });

		open();
		expect(socket.close).toHaveBeenCalledWith(1000);
	});

	it('OPEN 中は正常終了する', () => {
		const { socket } = createSocket(1);

		closeWebSocketOnCleanup(socket);

		expect(socket.close).toHaveBeenCalledWith(1000);
		expect(socket.addEventListener).not.toHaveBeenCalled();
	});

	it.each([2, 3])('readyState=%i の socket は操作しない', (readyState) => {
		const { socket } = createSocket(readyState);

		closeWebSocketOnCleanup(socket);

		expect(socket.close).not.toHaveBeenCalled();
		expect(socket.addEventListener).not.toHaveBeenCalled();
	});
});
