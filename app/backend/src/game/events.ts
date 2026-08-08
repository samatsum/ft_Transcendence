// B-10: snapshot の差分から ② §5-D のイベントを起こす。
//
// sim はイベントを吐かない（状態しか返さない）ので、**前後2つの snapshot を
// 比較して発火**させる。② §5-D のとおりイベントは演出・通知のトリガであり、
// 値の正本は常に snapshot 側にある。取りこぼしても状態は snapshot で追いつく。
import type { RoomEvent } from './room.js';
import type { SnapshotPayload } from './snapshot.js';

/**
 * 前後の snapshot を比べて発火すべきイベントを返す。
 *
 * `player_*` 系は接続の生存を見る必要があるため、ここではなく B-12 の責務。
 *
 * @param previous 直前に配信した snapshot。無い（最初の1件）なら何も起こさない
 */
export function diffEvents(
	previous: SnapshotPayload | null,
	current: SnapshotPayload,
	mode: 'rsp' | 'fps',
): RoomEvent[] {
	if (!previous) return [];
	const events: RoomEvent[] = [];

	// --- 得点（RSP のみ。FPS の score は [0,0] 固定） ---
	if (mode === 'rsp') {
		for (let team = 0; team < 2; team++) {
			const before = previous.match.score[team] ?? 0;
			const after = current.match.score[team] ?? 0;
			if (after > before) {
				events.push({
					t: 'event',
					d: {
						kind: 'point_scored',
						team,
						score: current.match.score,
						// snapshot は「誰が取ったか」を持たない（sim.h のレイアウトに無い）。
						// 演出側で不要なら null のままでよく、必要になればエンジンの
						// snapshot 拡張が要る＝② の改訂が先（⑥ §7-3）
						by_id: null,
					},
				});
			}
		}
	}

	// --- 手の変更（RSP。リスポーンと自陣踏み込みでサーバが変える） ---
	const previousHands = new Map(previous.combatants.map((c) => [c.id, c.hand]));
	for (const combatant of current.combatants) {
		const before = previousHands.get(combatant.id);
		if (before !== undefined && before !== combatant.hand) {
			events.push({ t: 'event', d: { kind: 'hand_changed', id: combatant.id, hand: combatant.hand } });
		}
	}

	// --- ゴール（FPS。決着した瞬間の winner が到達した combatant_id） ---
	if (
		mode === 'fps' &&
		previous.match.state !== 'finished' &&
		current.match.state === 'finished' &&
		current.match.winner !== null
	) {
		events.push({ t: 'event', d: { kind: 'goal', id: current.match.winner } });
	}

	return events;
}
