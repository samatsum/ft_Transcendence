import { useEffect, useRef, useState } from 'react';
import type { WelcomeMessage } from '@ft/shared';

import type { QueuedGameEvent, TimedSnapshot } from './useGameSocket.js';
import {
	applyGameEvent,
	createInitialHudState,
	expireFlashes,
	seatsFromSnapshot,
	type HudState,
} from './hudState.js';

// GV-07: HudOverlay が消費する派生 state を1本の hook に集約。
// - pendingEvents を到着順に applyGameEvent してから確認済みにする
// - 200ms 間隔で snapshotBufferRef.current の tail を読んでスコア/seats を更新
//   (snapshot ref は再レンダを走らせないので明示的にサンプリングする)
// - countdown は event(countdown, seconds:3) を受けて 3→2→1 と1秒ずつデクリメント
// - point/hand flash の期限切れは 200ms 間隔で expire

interface UseHudStateOptions {
	welcome: WelcomeMessage['d'] | null;
	snapshotBufferRef: { current: TimedSnapshot[] };
	pendingEvents: QueuedGameEvent[];
	acknowledgeEvents: (throughId: number) => void;
}

const HUD_POLL_MS = 200;

export function useHudState({
	welcome,
	snapshotBufferRef,
	pendingEvents,
	acknowledgeEvents,
}: UseHudStateOptions): HudState {
	const [state, setState] = useState<HudState>(createInitialHudState);
	// setState の関数形式内から現行 state を参照するとリアクトのバッチ挙動と絡んで
	// 誤ることがあるので、seats 初期化判定のために「最初の1回だけ」を ref で管理
	const seatsInitializedRef = useRef(false);
	// hand_changed のフラッシュ対象は自席のみ。welcome.combatant_id を ref で持つ
	const combatantIdRef = useRef<number | null>(null);
	combatantIdRef.current = welcome?.combatant_id ?? null;
	// countdown を1秒ずつ刻むための ID
	const countdownTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	// acknowledge の state 更新前に effect が再実行されても同じ event を二重適用しない
	const lastProcessedEventIdRef = useRef(0);

	// roomId 変更時は useGameSocket が welcome を null に戻すため、HUD の派生状態も初期化する
	useEffect(() => {
		if (welcome !== null) return;
		setState(createInitialHudState());
		seatsInitializedRef.current = false;
		lastProcessedEventIdRef.current = 0;
		if (countdownTimerRef.current) {
			clearInterval(countdownTimerRef.current);
			countdownTimerRef.current = null;
		}
	}, [welcome]);

	// snapshot polling: 200ms ごとに tail を読んで seats/score を反映
	useEffect(() => {
		const id = setInterval(() => {
			const buf = snapshotBufferRef.current;
			const tail = buf[buf.length - 1];
			if (!tail) return;
			setState((prev) => {
				let next = expireFlashes(prev, performance.now());
				// 初回だけ seats を snapshot から導出
				if (!seatsInitializedRef.current) {
					next = { ...next, seats: seatsFromSnapshot(tail.payload.combatants) };
					seatsInitializedRef.current = true;
				}
				// スコアは snapshot が正本(② §5-D: 「イベントは演出、正本は snapshot」)
				const [a, b] = tail.payload.match.score;
				if (next.score[0] !== a || next.score[1] !== b) {
					next = { ...next, score: [a, b] };
				}
				return next;
			});
		}, HUD_POLL_MS);
		return () => clearInterval(id);
	}, [snapshotBufferRef]);

	// event を到着順にまとめて state へ反映する
	// React が複数の WS 受信を同じ描画へ
	// batch しても、中間 event は pendingEvents に残るため取りこぼさない
	useEffect(() => {
		if (pendingEvents.length === 0) return;
		const eventsToProcess = pendingEvents.filter(({ id }) => id > lastProcessedEventIdRef.current);
		const throughId = pendingEvents[pendingEvents.length - 1]!.id;
		if (eventsToProcess.length === 0) {
			acknowledgeEvents(throughId);
			return;
		}
		lastProcessedEventIdRef.current = eventsToProcess[eventsToProcess.length - 1]!.id;
		const tail = snapshotBufferRef.current[snapshotBufferRef.current.length - 1];
		const finalSnapshotScore = tail?.payload.match.score;
		const nowMs = performance.now();
		let countdownCommand: { kind: 'start'; seconds: number } | { kind: 'stop' } | null = null;
		for (const { event } of eventsToProcess) {
			if (event.kind === 'countdown') {
				countdownCommand = { kind: 'start', seconds: event.seconds };
			} else if (event.kind === 'match_start') {
				countdownCommand = { kind: 'stop' };
			}
		}

		setState((prev) => {
			let next = prev;
			for (const { event } of eventsToProcess) {
				// hand_changed は自席のみフラッシュ(それ以外の席の hand 変更は演出しない)
				if (event.kind === 'hand_changed' && event.id !== combatantIdRef.current) continue;
				next = applyGameEvent(next, event, nowMs, finalSnapshotScore);
			}
			return next;
		});

		if (countdownCommand?.kind === 'start') {
			if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
			let remaining = countdownCommand.seconds;
			countdownTimerRef.current = setInterval(() => {
				remaining -= 1;
				if (remaining <= 0) {
					if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
					countdownTimerRef.current = null;
					setState((prev) => ({ ...prev, countdownSeconds: 0 }));
				} else {
					setState((prev) => ({ ...prev, countdownSeconds: remaining }));
				}
			}, 1000);
		} else if (countdownCommand?.kind === 'stop' && countdownTimerRef.current) {
			clearInterval(countdownTimerRef.current);
			countdownTimerRef.current = null;
		}

		acknowledgeEvents(throughId);
	}, [pendingEvents, acknowledgeEvents, snapshotBufferRef]);

	// unmount で countdown timer を掃除
	useEffect(() => {
		return () => {
			if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
		};
	}, []);

	return state;
}
