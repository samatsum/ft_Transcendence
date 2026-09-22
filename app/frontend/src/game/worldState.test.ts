import { describe, expect, it } from 'vitest';
import type { SnapshotPayload } from '@ft/shared';

import { applyWorldSnapshot, createWorldProgress } from './worldState.js';

function snapshot(collected: [number, number][], total = 3, doorsOpen = false): SnapshotPayload {
	return {
		tick: 2,
		match: { state: 'playing', mode: 'fps', winner: null, score: [0, 0] },
		combatants: [],
		world_delta: { collected, total, doors_open: doorsOpen },
	};
}

describe('applyWorldSnapshot', () => {
	it('全量座標を冪等に正規化する', () => {
		const first = applyWorldSnapshot(createWorldProgress(), snapshot([[1, 2], [1, 2]]));
		expect(first.collected).toEqual([[1, 2]]);
		expect(applyWorldSnapshot(first, snapshot([[1, 2]])).revision).toBe(first.revision);
	});

	it('後続の全量状態で取りこぼしを回復し、扉開放を反映する', () => {
		const first = applyWorldSnapshot(createWorldProgress(), snapshot([[1, 2]]));
		const recovered = applyWorldSnapshot(first, snapshot([[1, 2], [3, 4], [5, 6]], 3, true));
		expect(recovered.collected).toHaveLength(3);
		expect(recovered.total).toBe(3);
		expect(recovered.doorsOpen).toBe(true);
	});
});
