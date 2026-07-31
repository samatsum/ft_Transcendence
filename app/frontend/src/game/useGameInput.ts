// ゲーム入力の React フック（F-06 / ④ §3.3 の入力キャプチャ契約）。
//
// - Canvas クリックでキャプチャ開始、Esc で解除（解除中は移動入力を送らない）。
// - keydown/keyup は held ビットマスクを書き換えるだけ（穴5 の決定）。
// - setInterval 30Hz で最新 held + localYaw を全量送信（② §5-A: 状態駆動）。
// - ArrowLeft/Right は setInterval 側で localYaw に積分して即時反映
//   （② §5-C の「自分の yaw のみローカル優先」＝唯一の予測）。
// - タブ非表示/blur は全キー解放（押しっぱなし事故防止）。localYaw は保持。
// - spectator は input を送らない（サーバも黙って破棄するが二重防御）。

import { useCallback, useEffect, useRef, type RefObject } from 'react';
import type { GameClientMessage } from '@ft/shared';

// ② §5-A: mv 4bit ビットマスク
const MV_FORWARD = 0b0001;
const MV_BACKWARD = 0b0010;
const MV_STRAFE_LEFT = 0b0100;
const MV_STRAFE_RIGHT = 0b1000;

// KeyboardEvent.code → mv ビット
const HOLD_KEYS: Record<string, number> = {
	KeyW: MV_FORWARD,
	KeyS: MV_BACKWARD,
	KeyA: MV_STRAFE_LEFT,
	KeyD: MV_STRAFE_RIGHT,
};
// 回転（クライアント予測）は yaw 積分に一本化。C 側 rotate_speed=0.05/frame @ 60fps ≒ 3.0 rad/s
const ROTATE_RAD_PER_SEC = 3.0;
const INPUT_HZ = 30;

interface RotateHeld { left: boolean; right: boolean }

export interface UseGameInputOptions {
	canvasRef: RefObject<HTMLCanvasElement | null>;
	send: (msg: GameClientMessage) => void;
	/** true なら input を送らない（welcome.role === 'spectator'） */
	spectator: boolean;
	/** true なら送信ループを起動する（welcome 受信後・playing 状態など） */
	enabled: boolean;
}

export interface UseGameInputResult {
	/** 現在の local yaw（描画側が overrideDir に渡すため ref で公開） */
	localYawRef: RefObject<number>;
	/** キャプチャ中か */
	capturedRef: RefObject<boolean>;
	/** キャプチャ状態を外から見たいときの状態通知フック */
	setOnCaptureChange: (fn: ((captured: boolean) => void) | null) => void;
}

export function useGameInput({
	canvasRef,
	send,
	spectator,
	enabled,
}: UseGameInputOptions): UseGameInputResult {
	const heldMvRef = useRef<number>(0);
	const rotateRef = useRef<RotateHeld>({ left: false, right: false });
	const localYawRef = useRef<number>(0);
	const seqRef = useRef<number>(0);
	const capturedRef = useRef<boolean>(false);
	const captureListenerRef = useRef<((c: boolean) => void) | null>(null);

	// setInterval 送信ループ（穴5: 状態駆動・30Hz 全量送信）
	useEffect(() => {
		if (!enabled || spectator) return;
		let last = performance.now();
		const id = setInterval(() => {
			const now = performance.now();
			const dt = (now - last) / 1000;
			last = now;
			// キャプチャ中のみ localYaw を積分（Esc 解除中は視点も止める）
			if (capturedRef.current) {
				if (rotateRef.current.left) localYawRef.current -= ROTATE_RAD_PER_SEC * dt;
				if (rotateRef.current.right) localYawRef.current += ROTATE_RAD_PER_SEC * dt;
				// [-π, π) に正規化（サーバ側が finite チェックしかしないが素直に整えておく）
				while (localYawRef.current > Math.PI) localYawRef.current -= 2 * Math.PI;
				while (localYawRef.current < -Math.PI) localYawRef.current += 2 * Math.PI;
			}
			const mv = capturedRef.current ? heldMvRef.current : 0;
			seqRef.current = (seqRef.current + 1) >>> 0; // uint32
			send({
				t: 'input',
				d: { seq: seqRef.current, yaw: localYawRef.current, mv, act: 0 },
			});
		}, Math.floor(1000 / INPUT_HZ));
		return () => clearInterval(id);
	}, [enabled, spectator, send]);

	// キーイベント（held 書き換えのみ。送信は setInterval が担当）
	useEffect(() => {
		if (spectator) return;
		function clearAll() {
			heldMvRef.current = 0;
			rotateRef.current = { left: false, right: false };
		}
		function setCaptured(next: boolean) {
			capturedRef.current = next;
			if (!next) clearAll();
			captureListenerRef.current?.(next);
		}
		function onKeyDown(ev: KeyboardEvent) {
			if (!capturedRef.current) {
				// CodeRabbit 指摘: キーボードのみ操作の要件（④ §6-7）。
				// canvas に focus 済みの状態で Enter / Space を押したら capture 開始
				if (
					(ev.code === 'Enter' || ev.code === 'Space') &&
					document.activeElement === canvasRef.current
				) {
					ev.preventDefault();
					setCaptured(true);
				}
				return;
			}
			const bit = HOLD_KEYS[ev.code];
			if (bit !== undefined) {
				ev.preventDefault();
				heldMvRef.current |= bit;
			} else if (ev.code === 'ArrowLeft') {
				ev.preventDefault();
				rotateRef.current.left = true;
			} else if (ev.code === 'ArrowRight') {
				ev.preventDefault();
				rotateRef.current.right = true;
			} else if (ev.code === 'ArrowUp' || ev.code === 'ArrowDown') {
				// キャプチャ中のスクロール抑止（矢印は視点回転のみ、上下は使わない）
				ev.preventDefault();
			} else if (ev.code === 'Escape') {
				ev.preventDefault();
				setCaptured(false);
			}
		}
		function onKeyUp(ev: KeyboardEvent) {
			if (!capturedRef.current) return;
			const bit = HOLD_KEYS[ev.code];
			if (bit !== undefined) {
				ev.preventDefault();
				heldMvRef.current &= ~bit;
			} else if (ev.code === 'ArrowLeft') {
				ev.preventDefault();
				rotateRef.current.left = false;
			} else if (ev.code === 'ArrowRight') {
				ev.preventDefault();
				rotateRef.current.right = false;
			}
		}
		function onClick() {
			setCaptured(true);
			// canvas に focus を移して window key handler に届くようにする
			canvasRef.current?.focus();
		}
		function onVisibilityChange() {
			if (document.hidden) clearAll();
		}
		function onBlur() {
			clearAll();
		}
		const canvas = canvasRef.current;
		canvas?.addEventListener('click', onClick);
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		document.addEventListener('visibilitychange', onVisibilityChange);
		window.addEventListener('blur', onBlur);
		return () => {
			canvas?.removeEventListener('click', onClick);
			window.removeEventListener('keydown', onKeyDown);
			window.removeEventListener('keyup', onKeyUp);
			document.removeEventListener('visibilitychange', onVisibilityChange);
			window.removeEventListener('blur', onBlur);
		};
	}, [canvasRef, spectator]);

	// CodeRabbit 指摘: identity を安定化させて GameView 側の useEffect が
	// 再レンダごとに再セットアップされないようにする
	const setOnCaptureChange = useCallback(
		(fn: ((captured: boolean) => void) | null) => {
			captureListenerRef.current = fn;
		},
		[],
	);

	return {
		localYawRef,
		capturedRef,
		setOnCaptureChange,
	};
}
