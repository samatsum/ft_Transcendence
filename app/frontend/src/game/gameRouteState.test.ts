import { describe, expect, it } from 'vitest';

import { isGameRoomFinished, markGameRoomFinished } from './gameRouteState.js';

function createStorage() {
	const values = new Map<string, string>();
	return {
		getItem: (key: string) => values.get(key) ?? null,
		setItem: (key: string, value: string) => values.set(key, value),
	};
}

describe('finished game room route state', () => {
	it('match_end を記録した同じルームだけを終了済みと判定する', () => {
		const storage = createStorage();

		markGameRoomFinished('room-a', storage);

		expect(isGameRoomFinished('room-a', storage)).toBe(true);
		expect(isGameRoomFinished('room-b', storage)).toBe(false);
	});

	it('storage が利用できなくてもゲーム遷移を壊さない', () => {
		const unavailable = {
			getItem: () => { throw new Error('unavailable'); },
			setItem: () => { throw new Error('unavailable'); },
		};

		expect(() => markGameRoomFinished('room-a', unavailable)).not.toThrow();
		expect(isGameRoomFinished('room-a', unavailable)).toBe(false);
	});
});
