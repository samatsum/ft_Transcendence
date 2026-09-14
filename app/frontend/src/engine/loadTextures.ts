// テクスチャ manifest.json（`make web-assets` 生成物）を読み、
// マップが要求する分だけ .tex を fetch → `_web_register_texture` へ登録する。
//
// 「必要分ロード」は E-08 の決定（`wall/` と `object/` のみ map テキスト参照分。
// それ以外の enemy/hand/arm/interact/full はモード組込みで C 側にパス列挙 API が
// 無いため常時ロード）。engine_demo.js / replay.js の isRequired ロジックを踏襲。
//
// アセット配布は Makefile の `frontend-engine-assets` が
// `app/frontend/public/engine/assets/` へ配る（穴1 の決定）。

import type { LobbyMode } from '@ft/shared';

import type { RenderModule } from './render.d.ts';
import { writeCString } from './renderModule.js';

const MANIFEST_URL = '/engine/assets/manifest.json';
const ASSETS_BASE = '/engine/assets';

export interface ManifestEntry {
	/** cub 由来のパス文字列（D-16 のパス契約キー） */
	path: string;
	/** 変換済み .tex の相対パス（assets/ から） */
	tex: string;
}

// モードによって「そもそも C が読まないカテゴリ」がある（#165）。
//
// - `arm/` は fps/core/fps_assets.c の load_player_assets だけが読む。RSP は
//   render_rsp_hand で手を描くので腕を使わない
// - `hand/` は rsp/core/rsp_assets.c だけが読む
//
// どちらも読み込み失敗を致命としない作りなので、C は無改修のまま送らないだけでよい。
// `enemy/` は common/core/init.c の init_enemy_textures がモード分岐の外で呼び、
// 失敗を致命扱いにするため**両モードで必要**。絞るには C の変更が要る（#165 の範囲外）
const MODE_ONLY_PREFIXES: Record<LobbyMode, string> = {
	rsp: 'textures/arm/',
	fps: 'textures/hand/',
};

/** テストから直接叩くため export している（loadTextures は fetch と wasm を要るので呼べない） */
export function isRequired(entry: ManifestEntry, mapText: string, mode: LobbyMode): boolean {
	if (entry.path.startsWith(MODE_ONLY_PREFIXES[mode])) return false;
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
	mode: LobbyMode,
	onProgress?: (p: LoadTexturesProgress) => void,
): Promise<void> {
	const res = await fetch(MANIFEST_URL);
	if (!res.ok) throw new Error(`texture manifest fetch failed: ${MANIFEST_URL}`);
	const manifest = (await res.json()) as ManifestEntry[];
	const required = manifest.filter((e) => isRequired(e, mapText, mode));
	let loaded = 0;
	onProgress?.({ loaded, total: required.length });
	// 直列でロード（GATE1_REPORT 申し送り: 進捗表示が意味を持つよう順に落とす）。
	// .tex は無圧縮 RGBA なので 2048x2048 が1枚 16MB になる。rsp.cub では
	// 42枚 209.4MB 相当（#165 の実測）で、うち arm/ の 72MB をこのモード判定で落とす。
	// 転送量そのものは nginx の gzip_static が別途縮める（#192）
	for (const entry of required) {
		await registerOne(mod, entry);
		loaded += 1;
		onProgress?.({ loaded, total: required.length });
	}
}
