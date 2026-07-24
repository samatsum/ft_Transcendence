// E-13: render.wasm の内部解像度別スループット計測（Node ヘッドレス）。
// 「未達なら段階縮小」の判断材料になる fps 表を出す（① §6 E-13 の根拠データ）。
// ブラウザ実測とは絶対値が多少ずれるが、解像度間の相対比は描画コストの
// 支配項（レイキャスト列数 × 行数）を反映する。
// 実行: make web && node web/bench_render.mjs [maps/ 相対パス（既定 fps_map/1.cub）]
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const createRender = require(here('./build/render.js'));

const MAP = process.argv[2] || 'fps_map/1.cub';
const FRAMES = 300;  // 計測に使うフレーム数（この平均から fps を出す）
const WARMUP = 30;   // 計測前に空回しするフレーム数（JIT 最適化を効かせて初回の遅さを除く）
// MIN(848x480)〜MAX(1920x1080) の段階縮小候補。値は C 側でクランプされる
const RESOLUTIONS = [[1920, 1080], [1600, 900], [1280, 720], [960, 540], [848, 480]];

const mapText = readFileSync(here(`../maps/${MAP}`), 'utf8');
const manifest = JSON.parse(readFileSync(here('./assets/manifest.json'), 'utf8'));
const isRsp = MAP.startsWith('rsp_map/') ? 1 : 0;

function isRequired(entry) {
	if (entry.path.startsWith('textures/wall/') || entry.path.startsWith('textures/object/')) {
		return mapText.includes(entry.path);
	}
	return true;
}

async function bench(width, height) {
	const M = await createRender();
	const cstr = (text) => {
		const bytes = new TextEncoder().encode(text);
		const ptr = M._malloc(bytes.length + 1);
		M.HEAPU8.set(bytes, ptr);
		M.HEAPU8[ptr + bytes.length] = 0;
		return ptr;
	};
	for (const entry of manifest.filter(isRequired)) {
		const buf = readFileSync(here(`./${entry.tex}`));
		const pathPtr = cstr(entry.path);
		const dataPtr = M._malloc(buf.length - 8);
		M.HEAPU8.set(buf.subarray(8), dataPtr);
		if (!M._web_register_texture(pathPtr, dataPtr, buf.readUInt32LE(0), buf.readUInt32LE(4))) {
			throw new Error(`texture register failed: ${entry.path}`);
		}
		M._free(dataPtr);
		M._free(pathPtr);
	}
	const mapPtr = cstr(mapText);
	if (!M._web_init(mapPtr, isRsp, width, height)) {
		throw new Error('web_init failed');
	}
	M._free(mapPtr);
	const actualW = M._web_framebuffer_width();
	const actualH = M._web_framebuffer_height();
	// 前進+回転を混ぜてキャッシュに有利すぎる静止画にしない
	for (let f = 0; f < WARMUP; f++) {
		M._web_set_input(1, 0, 0, 0, 0, f % 2);
		M._web_render(1 / 60);
	}
	const start = performance.now();
	for (let f = 0; f < FRAMES; f++) {
		M._web_set_input(f % 40 < 20 ? 1 : 0, 0, 0, 0, 0, f % 2);
		M._web_render(1 / 60);
	}
	const ms = performance.now() - start;
	return { actualW, actualH, fps: (FRAMES * 1000) / ms, msPerFrame: ms / FRAMES };
}

console.log(`map=${MAP} frames=${FRAMES} (warmup ${WARMUP})`);
console.log('| 要求解像度 | 実解像度 | ms/frame | fps |');
console.log('|---|---|---|---|');
for (const [w, h] of RESOLUTIONS) {
	const r = await bench(w, h);
	console.log(`| ${w}x${h} | ${r.actualW}x${r.actualH} | ${r.msPerFrame.toFixed(2)} | ${r.fps.toFixed(1)} |`);
}
