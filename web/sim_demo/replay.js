// E-12 一方通行デモの再生側: record.mjs が書いた snapshot JSON 列を
// 「100ms 遅延の2点補間 → web_apply_snapshot → web_render_frame」で表示する
// （② §5-C の補間契約。クライアントに勝敗判定コードは無い）。
// W-11/F-06 では snapshots.json の代わりに WS 受信バッファが同じ経路に入る
(() => {
	const canvas = document.getElementById('screen');    // 描画先の <canvas>
	const statusEl = document.getElementById('status');  // 状態表示
	const fpsEl = document.getElementById('fps');        // fps 表示
	const ctx = canvas.getContext('2d', { alpha: false }); // Canvas 2D 描画コンテキスト
	// 「今から 100ms 過去」を描く遅延。この分だけ手元に前後2枚の snapshot が
	// 溜まるので、常に2点補間できる（② §5-C の補間契約）。値を上げるほど遅延は
	// 増えるが補間は安定、下げると滑らかさが崩れやすい
	const INTERP_DELAY_MS = 100;
	let image = null;          // Canvas へ書き込む ImageData
	let rgba = null;           // image.data。C の BGRA を RGBA に詰め替える先
	let fpsFrames = 0;         // 直近1秒のフレーム数（fps 表示用）
	let fpsStart = performance.now();  // fps 集計の起点時刻

	function locateFile(path) {
		if (path.endsWith('.wasm')) {
			return `../build/${path}?v=e12`;
		}
		return path;
	}

	function writeCString(Module, text) {
		const bytes = new TextEncoder().encode(text);
		const ptr = Module._malloc(bytes.length + 1);
		Module.HEAPU8.set(bytes, ptr);
		Module.HEAPU8[ptr + bytes.length] = 0;
		return ptr;
	}

	// engine_demo.js と同じ必要分ロード（wall/object はマップ参照分のみ。D-16 のパス契約）
	function isRequired(entry, mapText) {
		if (entry.path.startsWith('textures/wall/') || entry.path.startsWith('textures/object/')) {
			return mapText.includes(entry.path);
		}
		return true;
	}

	async function loadTexture(Module, entry) {
		const response = await fetch(`../${entry.tex}`);
		if (!response.ok) {
			throw new Error(`texture fetch failed: ${entry.tex}`);
		}
		const buffer = await response.arrayBuffer();
		const view = new DataView(buffer);
		const width = view.getUint32(0, true);
		const height = view.getUint32(4, true);
		const pixels = new Uint8Array(buffer, 8);
		const pathPtr = writeCString(Module, entry.path);
		const dataPtr = Module._malloc(pixels.byteLength);
		Module.HEAPU8.set(pixels, dataPtr);
		const ok = Module._web_register_texture(pathPtr, dataPtr, width, height);
		Module._free(dataPtr);
		Module._free(pathPtr);
		if (!ok) {
			throw new Error(`texture register failed: ${entry.path}`);
		}
	}

	function present(Module) {
		const ptr = Module._web_framebuffer_ptr();
		const width = Module._web_framebuffer_width();
		const height = Module._web_framebuffer_height();
		const stride = Module._web_framebuffer_stride();
		const src = Module.HEAPU8;
		let out = 0;
		for (let y = 0; y < height; y += 1) {
			const row = ptr + y * stride;
			for (let x = 0; x < width; x += 1) {
				const i = row + x * 4;
				rgba[out] = src[i + 2];
				rgba[out + 1] = src[i + 1];
				rgba[out + 2] = src[i];
				rgba[out + 3] = 255;
				out += 4;
			}
		}
		ctx.putImageData(image, 0, 0);
	}

	async function main() {
		const feedResponse = await fetch('snapshots.json');
		if (!feedResponse.ok) {
			throw new Error('snapshots.json が無い（先に `make sim && node web/sim_demo/record.mjs` を実行）');
		}
		const feed = await feedResponse.json();
		const snaps = feed.snapshots.map((s) => s.d);
		const timeOf = (d) => (d.tick / feed.tick_hz) * 1000;
		const mapResponse = await fetch(`../../maps/${feed.map}`);
		if (!mapResponse.ok) {
			throw new Error(`map fetch failed: ${feed.map}`);
		}
		const mapText = await mapResponse.text();
		const Module = await createCub3DModule({ locateFile });
		if (window.__cub3dTextDecoder) {
			window.TextDecoder = window.__cub3dTextDecoder;
		}
		const manifest = await (await fetch('../assets/manifest.json')).json();
		const required = manifest.filter((entry) => isRequired(entry, mapText));
		statusEl.textContent = `loading ${required.length}/${manifest.length} textures`;
		await Promise.all(required.map((entry) => loadTexture(Module, entry)));
		const mapPtr = writeCString(Module, mapText);
		// 内部解像度は既定（960x540）。0 は「指定なし」（E-13 の web_init 引数）
		if (!Module._web_init(mapPtr, feed.map.startsWith('rsp_map/') ? 1 : 0, 0, 0)) {
			throw new Error('web_init failed');
		}
		Module._free(mapPtr);
		canvas.width = Module._web_framebuffer_width();
		canvas.height = Module._web_framebuffer_height();
		image = ctx.createImageData(canvas.width, canvas.height);
		rgba = image.data;

		const flatPtr = Module._malloc(8 * 256);
		const start = performance.now();
		const t0 = timeOf(snaps[0]);
		let index = 0;
		function tick(now) {
			// 「now - 100ms」時点を挟む2スナップショットで補間（② §5-C の契約）
			const playT = t0 + (now - start) - INTERP_DELAY_MS;
			while (index + 1 < snaps.length && timeOf(snaps[index + 1]) <= playT) {
				index += 1;
			}
			const cur = snaps[index];
			const next = snaps[index + 1] ?? null;
			let alpha = 0;
			if (next) {
				alpha = (playT - timeOf(cur)) / (timeOf(next) - timeOf(cur));
				alpha = Math.min(1, Math.max(0, alpha));
			}
			const flat = window.Cub3DSnapshotInterp.interpolate(cur, next, alpha);
			Module.HEAPF64.set(flat, flatPtr / 8);
			Module._web_apply_snapshot(flatPtr, flat.length, feed.view_id);
			Module._web_render_frame();
			present(Module);
			statusEl.textContent = `snapshot ${index + 1}/${snaps.length}  state=${cur.match.state}`
				+ `  score=[${cur.match.score}]  view=combatant#${feed.view_id}`;
			fpsFrames += 1;
			if (now - fpsStart >= 1000) {
				fpsEl.textContent = `${Math.round((fpsFrames * 1000) / (now - fpsStart))} fps`;
				fpsFrames = 0;
				fpsStart = now;
			}
			requestAnimationFrame(tick);
		}
		requestAnimationFrame(tick);
	}

	main().catch((err) => {
		statusEl.textContent = err.message;
		throw err;
	});
})();
