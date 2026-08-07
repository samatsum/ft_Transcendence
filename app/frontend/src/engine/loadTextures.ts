// テクスチャ manifest.json（`make web-assets` 生成物）を読み、
// マップが要求する分だけ .tex を fetch → `_web_register_texture` へ登録する。
//
// 「必要分ロード」は E-08 の決定（`wall/` と `object/` のみ map テキスト参照分。
// それ以外の enemy/hand/arm/interact/full はモード組込みで C 側にパス列挙 API が
// 無いため常時ロード）。engine_demo.js / replay.js の isRequired ロジックを踏襲。
//
// アセット配布は Makefile の `frontend-engine-assets` が
// `app/frontend/public/engine/assets/` へ配る（穴1 の決定）。

import type { RenderModule } from './render.d.ts';
import { writeCString } from './renderModule.js';

const MANIFEST_URL = '/engine/assets/manifest.json';
const ASSETS_BASE = '/engine/assets';

interface ManifestEntry {
	/** cub 由来のパス文字列（D-16 のパス契約キー） */
	path: string;
	/** 変換済み .tex の相対パス（assets/ から） */
	tex: string;
}

function isRequired(entry: ManifestEntry, mapText: string): boolean {
	if (
		entry.path.startsWith('textures/wall/') ||
		entry.path.startsWith('textures/object/')
	) {
		return mapText.includes(entry.path);
	}
	return true;
}

async function registerOne(mod: RenderModule, entry: ManifestEntry): Promise<void> {
	const url = entry.tex.startsWith('/') ? entry.tex : `${ASSETS_BASE}/${entry.tex.replace(/^assets\//, '')}`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`texture fetch failed: ${url}`);
	const buffer = await res.arrayBuffer();
	const view = new DataView(buffer);
	const width = view.getUint32(0, true);
	const height = view.getUint32(4, true);
	const pixels = new Uint8Array(buffer, 8);
	const pathPtr = writeCString(mod, entry.path);
	// CodeRabbit 指摘: dataPtr=0（_malloc 失敗）で HEAPU8.set を呼ぶと
	// wasm ヒープ先頭を破壊する。事前検証し、失敗時は既に確保した pathPtr を
	// 必ず free してから throw する（finally は throw より前に到達するので pathPtr は残す）
	const dataPtr = mod._malloc(pixels.byteLength);
	if (dataPtr === 0) {
		mod._free(pathPtr);
		throw new Error(`texture data malloc failed: ${entry.path}`);
	}
	try {
		mod.HEAPU8.set(pixels, dataPtr);
		const ok = mod._web_register_texture(pathPtr, dataPtr, width, height);
		if (!ok) throw new Error(`texture register failed: ${entry.path}`);
	} finally {
		mod._free(dataPtr);
		mod._free(pathPtr);
	}
}

export interface LoadTexturesProgress {
	loaded: number;
	total: number;
}

export async function loadTextures(
	mod: RenderModule,
	mapText: string,
	onProgress?: (p: LoadTexturesProgress) => void,
): Promise<void> {
	const res = await fetch(MANIFEST_URL);
	if (!res.ok) throw new Error(`texture manifest fetch failed: ${MANIFEST_URL}`);
	const manifest = (await res.json()) as ManifestEntry[];
	const required = manifest.filter((e) => isRequired(e, mapText));
	let loaded = 0;
	onProgress?.({ loaded, total: required.length });
	// 直列でロード（GATE1_REPORT 申し送り: 進捗表示が意味を持つよう順に落とす）。
	// 現状は 42/99 前後で数百KB、序盤の描画までは1〜2秒
	for (const entry of required) {
		await registerOne(mod, entry);
		loaded += 1;
		onProgress?.({ loaded, total: required.length });
	}
}
