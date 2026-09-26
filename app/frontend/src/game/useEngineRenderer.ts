// render.wasm を Canvas に載せて、snapshot バッファを 100ms 遅延で補間しながら
// 毎フレーム描画するフック（GV-06 / ② §5-C / ④ §4）。
//
// 責務:
//   - welcome 受信後 → render.wasm ロード → texture 必要分ロード → web_init。
//   - requestAnimationFrame で `now - 100ms` を挟む2snapshot を補間、
//     自席（welcome.combatant_id）の dir は localYawRef で上書き、
//     `_web_apply_snapshot` → `_web_render_frame` → ImageData present。
//   - 射撃ボタン押下中は `_web_play_shot` で自分の武器モーションだけを出す（#187）。
//     命中はサーバの sim が決め、C 側がクールダウン中の呼び出しを無視するので毎フレーム呼んでよい。
//   - unmount で rAF / Module 解放（React 19 StrictMode の二重マウントに耐える）。
//
// 補間の時計基準: `performance.now() - 100ms` を描画時刻とし、snapshot の到着時刻
//   （同じ performance.now）と比べて2枚を選ぶ。サーバ tick との絶対同期は取らない（② §8）。
//   基準時刻を持たない理由は interpClock.ts（#194）。

import { useEffect, useState, type RefObject } from 'react';
import type { WelcomeMessage } from '@ft/shared';

import { interpolate } from '../engine/snapshotInterp.js';
import { loadTextures, type LoadTexturesProgress } from '../engine/loadTextures.js';
import { createRenderModule, writeCString } from '../engine/renderModule.js';
import type { RenderModule } from '../engine/render.d.ts';
import { selectFrame } from './interpClock.js';
import type { TimedSnapshot } from './useGameSocket.js';
import type { WorldProgress } from './worldState.js';

const INTERP_DELAY_MS = 100;

export type RendererStatus =
	| 'idle'
	| 'loading-glue'
	| 'loading-textures'
	| 'ready'
	| 'error';

export interface UseEngineRendererOptions {
	canvasRef: RefObject<HTMLCanvasElement | null>;
	/** サーバから来た welcome。null の間はロードしない */
	welcome: WelcomeMessage['d'] | null;
	/** useGameSocket の snapshotBuffer をそのまま参照する（15Hz 再レンダを避けるため ref） */
	snapshotBufferRef: { current: TimedSnapshot[] };
	worldProgressRef: { current: WorldProgress };
	/** 自席の視点(localYaw)。ref なので再レンダに巻き込まない */
	localYawRef: RefObject<number>;
	/** 射撃ボタンを押しているか（useGameInput の fireHeldRef）。観戦者など入力の無い画面では省略 */
	fireHeldRef?: RefObject<boolean>;
}

export interface UseEngineRendererResult {
	status: RendererStatus;
	textureProgress: LoadTexturesProgress | null;
	errorMessage: string | null;
	/** 直近1秒間のフレーム数（HUD の fps 表示用） */
	fps: number;
}

export function useEngineRenderer({
	canvasRef,
	welcome,
	snapshotBufferRef,
	worldProgressRef,
	localYawRef,
	fireHeldRef,
}: UseEngineRendererOptions): UseEngineRendererResult {
	const [status, setStatus] = useState<RendererStatus>('idle');
	const [textureProgress, setTextureProgress] = useState<LoadTexturesProgress | null>(null);
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [fps, setFps] = useState<number>(0);

	// CodeRabbit 指摘#2: reconnect（welcome.resume=true）では map_text / mode /
	// combatant_id は変わらないので、welcome の参照ではなくこれら primitive を deps に
	// 並べる。参照が新しくても中身が同じ session なら wasm 再ロード・再 web_init しない。
	const mapText = welcome?.map_text ?? null;
	const mode = welcome?.mode ?? null;
	const combatantId = welcome?.combatant_id ?? null;
	const targetScore = welcome?.rules.target_score ?? 0;

	useEffect(() => {
		if (!mapText || !mode) return;
		const canvas = canvasRef.current;
		if (!canvas) return;

		let cancelled = false;
		let mod: RenderModule | null = null;
		let flatPtr = 0;
		let flatCap = 0;
		let worldPtr = 0;
		let worldCap = 0;
		let appliedWorldRevision = -1;
		let rafHandle = 0;
		let imageData: ImageData | null = null;
		let ctx: CanvasRenderingContext2D | null = null;
		let fpsFrames = 0;
		let fpsWindowStart = performance.now();

		function present(m: RenderModule): void {
			const ptr = m._web_framebuffer_ptr();
			const w = m._web_framebuffer_width();
			const h = m._web_framebuffer_height();
			const stride = m._web_framebuffer_stride();
			const src = m.HEAPU8;
			if (!imageData || !ctx) return;
			const rgba = imageData.data;
			let out = 0;
			for (let y = 0; y < h; y += 1) {
				const row = ptr + y * stride;
				for (let x = 0; x < w; x += 1) {
					const i = row + x * 4;
					// noUncheckedIndexedAccess の下で TypedArray は undefined 型になるが
					// ここでは framebuffer 範囲内でアクセスするので nullish coalesce で 0 に落とす
					rgba[out] = src[i + 2] ?? 0;
					rgba[out + 1] = src[i + 1] ?? 0;
					rgba[out + 2] = src[i] ?? 0;
					rgba[out + 3] = 255;
					out += 4;
				}
			}
			ctx.putImageData(imageData, 0, 0);
		}

		function loop() {
			if (cancelled || !mod) return;
			// 描画時刻を過ぎた最後の snapshot で止まる（決着後や通信断でループしない。#194）。
			// 旧実装にあった「tail を追い越したら基準を打ち直す」処理（CodeRabbit 指摘への
			// 対策）は、基準時刻を持たなくなったので不要。通信が戻れば新しい snapshot との
			// 間でそのまま補間が再開する
			const sel = selectFrame(snapshotBufferRef.current, performance.now() - INTERP_DELAY_MS);
			if (!sel) {
				rafHandle = requestAnimationFrame(loop);
				return;
			}
			const { cur, next, alpha } = sel;
			// 穴3 の決定: 自席（welcome.combatant_id）の dir を localYaw で上書き
			const overrideDir = combatantId !== null
				? { id: combatantId, dir: localYawRef.current }
				: undefined;
			const flat = interpolate(cur.payload, next?.payload ?? null, alpha, overrideDir);
			try {
				const world = worldProgressRef.current;
				if (world.revision !== appliedWorldRevision) {
					const positions = new Float64Array(world.collected.flat());
					if (positions.byteLength > worldCap) {
						if (worldPtr !== 0) mod._free(worldPtr);
						worldCap = positions.byteLength;
						worldPtr = worldCap === 0 ? 0 : mod._malloc(worldCap);
						if (worldCap > 0 && worldPtr === 0) throw new Error('_malloc failed');
					}
					if (worldPtr !== 0) mod.HEAPF64.set(positions, worldPtr / 8);
					mod._web_apply_world_delta(worldPtr, positions.length, world.doorsOpen ? 1 : 0);
					appliedWorldRevision = world.revision;
				}
				// wasm ヒープの再確保が要るか
				const bytes = flat.byteLength;
				if (bytes > flatCap) {
					if (flatPtr !== 0) mod._free(flatPtr);
					flatCap = bytes;
					flatPtr = mod._malloc(flatCap);
					// CodeRabbit 指摘#3: _malloc 失敗（OOM）時に 0 を書くと
					// wasm ヒープの先頭を破壊するので必ずチェック
					if (flatPtr === 0) {
						flatCap = 0;
						throw new Error('_malloc failed (wasm メモリ枯渇の可能性)');
					}
				}
				mod.HEAPF64.set(flat, flatPtr / 8);
				const viewId = combatantId ?? 0;
				mod._web_apply_snapshot(flatPtr, flat.length, viewId);
				if (fireHeldRef?.current) mod._web_play_shot();
				mod._web_render_frame();
				present(mod);
			} catch (err) {
				setStatus('error');
				setErrorMessage(err instanceof Error ? err.message : String(err));
				return; // 再スケジュールしない（無限リトライ回避）
			}
			fpsFrames += 1;
			const nowMs = performance.now();
			if (nowMs - fpsWindowStart >= 1000) {
				setFps(Math.round((fpsFrames * 1000) / (nowMs - fpsWindowStart)));
				fpsFrames = 0;
				fpsWindowStart = nowMs;
			}
			rafHandle = requestAnimationFrame(loop);
		}

		(async () => {
			try {
				setStatus('loading-glue');
				const m = await createRenderModule();
				if (cancelled) return;
				mod = m;
				setStatus('loading-textures');
				setTextureProgress({ loaded: 0, total: 0 });
				await loadTextures(m, mapText, mode, (p) => setTextureProgress(p));
				if (cancelled) return;
				// map テキストを wasm ヒープへ書き、web_init
				const mapPtr = writeCString(m, mapText);
				try {
					const isRsp = mode === 'rsp' ? 1 : 0;
					// 内部解像度は既定（960x540）。0 は「指定なし」（E-13 の web_init 引数）
					const ok = m._web_init(mapPtr, isRsp, 0, 0, targetScore);
					if (!ok) throw new Error('web_init failed');
				} finally {
					m._free(mapPtr);
				}
				// Canvas サイズを内部解像度に合わせる（CSS で letterbox 拡大する前提）
				const w = m._web_framebuffer_width();
				const h = m._web_framebuffer_height();
				canvas.width = w;
				canvas.height = h;
				ctx = canvas.getContext('2d', { alpha: false });
				if (!ctx) throw new Error('canvas 2d context 取得失敗');
				imageData = ctx.createImageData(w, h);
				setStatus('ready');
				rafHandle = requestAnimationFrame(loop);
			} catch (err) {
				if (cancelled) return;
				setStatus('error');
				setErrorMessage(err instanceof Error ? err.message : String(err));
			}
		})();

		return () => {
			cancelled = true;
			if (rafHandle) cancelAnimationFrame(rafHandle);
			if (mod && flatPtr !== 0) mod._free(flatPtr);
			if (mod && worldPtr !== 0) mod._free(worldPtr);
			// Emscripten Module の完全 destroy 手段は公開されていないので、
			// GC 任せ（unmount 後の rAF は cancelled で止まっているので副作用なし）
			mod = null;
		};
	}, [mapText, mode, combatantId, targetScore, canvasRef, snapshotBufferRef, worldProgressRef, localYawRef, fireHeldRef]);

	return { status, textureProgress, errorMessage, fps };
}
