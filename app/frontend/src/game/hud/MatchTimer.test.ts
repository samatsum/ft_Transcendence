import { describe, expect, it } from 'vitest';

import { formatTimeLeft } from './MatchTimer.js';

describe('formatTimeLeft', () => {
	it('制限時間ちょうどは 3:00 と表示する', () => {
		expect(formatTimeLeft(180_000)).toBe('3:00');
	});

	it('秒は切り上げ、まだ残っている間は 0:00 にしない', () => {
		expect(formatTimeLeft(59_001)).toBe('1:00');
		expect(formatTimeLeft(400)).toBe('0:01');
	});

	it('時間切れと負値は 0:00', () => {
		expect(formatTimeLeft(0)).toBe('0:00');
		expect(formatTimeLeft(-50)).toBe('0:00');
	});
});
