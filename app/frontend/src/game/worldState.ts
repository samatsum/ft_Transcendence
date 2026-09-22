import type { SnapshotPayload } from '@ft/shared';

export interface WorldProgress {
	collected: readonly [number, number][];
	doorsOpen: boolean;
	revision: number;
}

export function createWorldProgress(): WorldProgress {
	return { collected: [], doorsOpen: false, revision: 0 };
}

/** `world_delta.collected` は常に全量なので、座標集合を置換して欠落から復旧する */
export function applyWorldSnapshot(state: WorldProgress, snapshot: SnapshotPayload): WorldProgress {
	const delta = snapshot.world_delta;
	if (snapshot.match.mode !== 'fps' || !delta) return state;
	const unique = new Map<string, [number, number]>();
	for (const [x, y] of delta.collected) unique.set(`${x},${y}`, [x, y]);
	const collected = [...unique.values()];
	const unchanged = state.doorsOpen === delta.doors_open
		&& state.collected.length === collected.length
		&& state.collected.every(([x, y], i) => x === collected[i]?.[0] && y === collected[i]?.[1]);
	return unchanged
		? state
		: { collected, doorsOpen: delta.doors_open, revision: state.revision + 1 };
}
