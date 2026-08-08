import { useEffect, useRef, useState } from 'react';
import type { GameEvent, WelcomeMessage } from '@ft/shared';

import type { TimedSnapshot } from './useGameSocket.js';
import {
	applyGameEvent,
	createInitialHudState,
	expireFlashes,
	seatsFromSnapshot,
	type HudState,
} from './hudState.js';

// GV-07: HudOverlay が消費する派生 state を1本の hook に集約。
// - lastEvent の変化ごとに applyGameEvent
// - 200ms 間隔で snapshotBufferRef.current の tail を読んでスコア/seats を更新
//   (snapshot ref は再レンダを走らせないので明示的にサンプリングする)
// - countdown は event(countdown, seconds:3) を受けて 3→2→1 と1秒ずつデクリメント
// - point/hand flash の期限切れは 200ms 間隔で expire

interface UseHudStateOptions {
	welcome: WelcomeMessage['d'] | null;
	snapshotBufferRef: { current: TimedSnapshot[] };
	lastEvent: GameEvent['d'] | null;
}

const HUD_POLL_MS = 200;

export function useHudState({
	welcome,
	snapshotBufferRef,
	lastEvent,
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
	// event object の identity で「既に処理したか」を判定(useGameSocket は同じ event を
	// state で保持するので、複数回 useEffect が走ってもここで dedup する)
	const lastEventRef = useRef<GameEvent['d'] | null>(null);

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

	// event を state に反映
	useEffect(() => {
		if (!lastEvent) return;
		if (lastEventRef.current === lastEvent) return; // 同 identity なら処理済み
		lastEventRef.current = lastEvent;
		// hand_changed は自席のみフラッシュ(それ以外の席の hand 変更は演出しない)
		if (lastEvent.kind === 'hand_changed' && lastEvent.id !== combatantIdRef.current) {
			return;
		}
		setState((prev) => applyGameEvent(prev, lastEvent, performance.now()));

		// countdown を1秒ずつ刻む
		if (lastEvent.kind === 'countdown') {
			if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
			let remaining = lastEvent.seconds;
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
		}
		// match_start が来たら countdown timer を停止(applyGameEvent 側で state は消える)
		if (lastEvent.kind === 'match_start' && countdownTimerRef.current) {
			clearInterval(countdownTimerRef.current);
			countdownTimerRef.current = null;
		}
	}, [lastEvent]);

	// unmount で countdown timer を掃除
	useEffect(() => {
		return () => {
			if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
		};
	}, []);

	return state;
}
