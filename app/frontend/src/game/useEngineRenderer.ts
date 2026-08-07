// render.wasm を Canvas に載せて、snapshot バッファを 100ms 遅延で補間しながら
// 毎フレーム描画するフック（F-06 / ② §5-C / ④ §4）。
//
// 責務:
//   - welcome 受信後 → render.wasm ロード → texture 必要分ロード → web_init。
//   - requestAnimationFrame で `now - 100ms` を挟む2snapshot を補間、
//     自席（welcome.combatant_id）の dir は localYawRef で上書き、
//     `_web_apply_snapshot` → `_web_render_frame` → ImageData present。
//   - unmount で rAF / Module 解放（React 19 StrictMode の二重マウントに耐える）。
//
// 補間の時計基準: 最初の snapshot 受信時刻を playhead=0 とし、以後 elapsed - 100ms を
//   描画時刻とする。サーバ tick との絶対同期は取らず、到着間隔から相対時間を導く（② §8）。

import { useEffect, useState, type RefObject } from 'react';
import type { WelcomeMessage } from '@ft/shared';

import { interpolate } from '../engine/snapshotInterp.js';
import { loadTextures, type LoadTexturesProgress } from '../engine/loadTextures.js';
import { createRenderModule, writeCString } from '../engine/renderModule.js';
import type { RenderModule } from '../engine/render.d.ts';
import type { TimedSnapshot } from './useGameSocket.js';

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
	/** 自席の視点(localYaw)。ref なので再レンダに巻き込まない */
	localYawRef: RefObject<number>;
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
	localYawRef,
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

	useEffect(() => {
		if (!mapText || !mode) return;
		const canvas = canvasRef.current;
		if (!canvas) return;

		let cancelled = false;
		let mod: RenderModule | null = null;
		let flatPtr = 0;
		let flatCap = 0;
		let rafHandle = 0;
		let imageData: ImageData | null = null;
		let ctx: CanvasRenderingContext2D | null = null;
		let playheadStartMs = 0;
		let firstSnapshotReceivedAt = 0;
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
			const buf = snapshotBufferRef.current;
			if (!buf || buf.length === 0) {
				rafHandle = requestAnimationFrame(loop);
				return;
			}
			const head = buf[0];
			if (!head) {
				rafHandle = requestAnimationFrame(loop);
				return;
			}
			// 補間時計: 最初の snapshot 到着時刻を基準にする
			if (firstSnapshotReceivedAt === 0) {
				firstSnapshotReceivedAt = head.receivedAtMs;
				playheadStartMs = performance.now();
			}
			// CodeRabbit 指摘: playhead が tail を超えて進んだ場合（長時間の無通信の後）、
			// 補間クロックが固定のままだと、通信が再開しても「未来」を再生し続けて
			// alpha が退化する。tail が現在時刻の外に出たら基準を打ち直し、
			// 100ms の補間遅延を保ちながら次の snapshot が来たら滑らかに繋がるようにする
			const tail = buf[buf.length - 1];
			if (tail) {
				const tailRelUnderCurrent = tail.receivedAtMs - firstSnapshotReceivedAt;
				const currentPlayAt = (performance.now() - playheadStartMs) - INTERP_DELAY_MS;
				if (currentPlayAt > tailRelUnderCurrent) {
					firstSnapshotReceivedAt = tail.receivedAtMs;
					playheadStartMs = performance.now();
				}
			}
			const nowElapsed = performance.now() - playheadStartMs;
			const playAtServerMs = nowElapsed - INTERP_DELAY_MS;
			// buf は「サーバ到着時刻の相対時間」で並んでいる（receivedAtMs - firstSnapshotReceivedAt）
			let i = 0;
			while (i + 1 < buf.length) {
				const nx = buf[i + 1];
				if (!nx) break;
				if (nx.receivedAtMs - firstSnapshotReceivedAt > playAtServerMs) break;
				i += 1;
			}
			const cur = buf[i];
			if (!cur) {
				rafHandle = requestAnimationFrame(loop);
				return;
			}
			const next = buf[i + 1] ?? null;
			let alpha = 0;
			if (next) {
				const t0 = cur.receivedAtMs - firstSnapshotReceivedAt;
				const t1 = next.receivedAtMs - firstSnapshotReceivedAt;
				alpha = t1 > t0 ? (playAtServerMs - t0) / (t1 - t0) : 0;
				if (alpha < 0) alpha = 0;
				if (alpha > 1) alpha = 1;
			}
			// 穴3 の決定: 自席（welcome.combatant_id）の dir を localYaw で上書き
			const overrideDir = combatantId !== null
				? { id: combatantId, dir: localYawRef.current }
				: undefined;
			const flat = interpolate(cur.payload, next?.payload ?? null, alpha, overrideDir);
			try {
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
				await loadTextures(m, mapText, (p) => setTextureProgress(p));
				if (cancelled) return;
				// map テキストを wasm ヒープへ書き、web_init
				const mapPtr = writeCString(m, mapText);
				try {
					const isRsp = mode === 'rsp' ? 1 : 0;
					// 内部解像度は既定（960x540）。0 は「指定なし」（E-13 の web_init 引数）
					const ok = m._web_init(mapPtr, isRsp, 0, 0);
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
			// Emscripten Module の完全 destroy 手段は公開されていないので、
			// GC 任せ（unmount 後の rAF は cancelled で止まっているので副作用なし）
			mod = null;
		};
	}, [mapText, mode, combatantId, canvasRef, snapshotBufferRef, localYawRef]);

	return { status, textureProgress, errorMessage, fps };
}
