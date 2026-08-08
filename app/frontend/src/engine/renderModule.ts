// render.js（emcc glue、MODULARIZE=1 EXPORT_NAME=createCub3DModule）を
// ブラウザに動的にロードするヘルパ（GV-06）。
//
// glue はスクリプト読み込み時に `window.createCub3DModule = (opts) => Promise<Module>`
// を定義する。ここでは <script> を挿入して当該グローバルの登場を待ち、
// 得たファクトリを opts 付きで呼んで Module を返す。
//
// アセット配布は Makefile の `frontend-engine-assets` ターゲットが
// `app/frontend/public/engine/` へ配る（穴1 の決定）。Vite dev / nginx とも
// 同じパスから配信するため、URL は /engine/build/render.{js,wasm} で統一する。

import type { CreateRenderModule, RenderModule } from './render.d.ts';

const GLUE_URL = '/engine/build/render.js';
const WASM_URL = '/engine/build/render.wasm';

let scriptPromise: Promise<CreateRenderModule> | null = null;

function loadGlueOnce(): Promise<CreateRenderModule> {
	if (typeof window === 'undefined') {
		return Promise.reject(new Error('render.wasm はブラウザ環境でのみ読み込める'));
	}
	if (window.createCub3DModule) {
		return Promise.resolve(window.createCub3DModule);
	}
	if (scriptPromise) return scriptPromise;
	scriptPromise = new Promise<CreateRenderModule>((resolve, reject) => {
		// engine_demo.html の TextDecoder shim をここでも適用する
		// （GATE1_REPORT: Chrome の resizable ArrayBuffer 問題）
		if (typeof window.__cub3dTextDecoder === 'undefined') {
			window.__cub3dTextDecoder = window.TextDecoder;
			(window as unknown as { TextDecoder: undefined }).TextDecoder = undefined;
		}
		const script = document.createElement('script');
		script.src = GLUE_URL;
		script.async = true;
		function restoreTextDecoder() {
			if (window.__cub3dTextDecoder) {
				window.TextDecoder = window.__cub3dTextDecoder;
				// CodeRabbit 追加指摘: sentinel を undefined に戻して、次回の
				// loadGlueOnce リトライで上部の shim アーム条件を通す。残したままだと
				// retry 時 shim が張られず GATE1 の resizable ArrayBuffer 問題を踏む
				window.__cub3dTextDecoder = undefined;
			}
		}
		script.onload = () => {
			restoreTextDecoder();
			const factory = window.createCub3DModule;
			if (!factory) {
				reject(new Error('render.js は読み込めたが createCub3DModule が未定義'));
				return;
			}
			resolve(factory);
		};
		script.onerror = () => {
			// 失敗時も native TextDecoder を必ず戻す。戻さないと再試行や他機能で
			// TextDecoder が undefined のまま参照エラーになる（CodeRabbit 指摘）
			restoreTextDecoder();
			scriptPromise = null;
			reject(new Error(`render.js の読み込みに失敗: ${GLUE_URL}`));
		};
		document.head.appendChild(script);
	});
	return scriptPromise;
}

export async function createRenderModule(): Promise<RenderModule> {
	const factory = await loadGlueOnce();
	return factory({
		locateFile: (path) => (path.endsWith('.wasm') ? WASM_URL : path),
	});
}

// C の文字列引数を渡すヘルパ。渡した ptr は呼び出し側が `_free` すること
export function writeCString(mod: RenderModule, text: string): number {
	const bytes = new TextEncoder().encode(text);
	const ptr = mod._malloc(bytes.length + 1);
	// CodeRabbit 指摘: _malloc が 0 を返した場合に HEAPU8 の先頭を破壊しないよう
	// 事前に検証する。呼び出し側は catch して Toast / error status に流す
	if (ptr === 0) {
		throw new Error('writeCString: _malloc failed (wasm メモリ枯渇の可能性)');
	}
	mod.HEAPU8.set(bytes, ptr);
	mod.HEAPU8[ptr + bytes.length] = 0;
	return ptr;
}
