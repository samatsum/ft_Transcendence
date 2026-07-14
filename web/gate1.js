(() => {
	const canvas = document.getElementById('screen');
	const statusEl = document.getElementById('status');
	const fpsEl = document.getElementById('fps');
	const ctx = canvas.getContext('2d', { alpha: false });
	const textEncoder = new TextEncoder();
	let moduleRef = null;
	let image = null;
	let rgba = null;
	let last = performance.now();
	let fpsFrames = 0;
	let fpsStart = last;

	function locateFile(path) {
		if (path.endsWith('.wasm') || path.endsWith('.data')) {
			return `build/${path}`;
		}
		return path;
	}

	function writeCString(Module, text) {
		const bytes = textEncoder.encode(text);
		const ptr = Module._malloc(bytes.length + 1);
		Module.HEAPU8.set(bytes, ptr);
		Module.HEAPU8[ptr + bytes.length] = 0;
		return ptr;
	}

	async function loadTexture(Module, entry) {
		const response = await fetch(entry.tex);
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
			let row = ptr + y * stride;
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

	function tick(now) {
		const dt = Math.min((now - last) / 1000, 0.05);
		last = now;
		moduleRef._web_render(dt || (1 / 60));
		present(moduleRef);
		fpsFrames += 1;
		if (now - fpsStart >= 1000) {
			fpsEl.textContent = `${Math.round((fpsFrames * 1000) / (now - fpsStart))} fps`;
			fpsFrames = 0;
			fpsStart = now;
		}
		requestAnimationFrame(tick);
	}

	async function main() {
		const Module = await createCub3DModule({ locateFile });
		if (window.__cub3dTextDecoder) {
			window.TextDecoder = window.__cub3dTextDecoder;
		}
		moduleRef = Module;
		const manifestResponse = await fetch('assets/manifest.json');
		if (!manifestResponse.ok) {
			throw new Error('texture manifest fetch failed');
		}
		const manifest = await manifestResponse.json();
		for (const entry of manifest) {
			await loadTexture(Module, entry);
		}
		if (!Module._web_init()) {
			throw new Error('web_init failed');
		}
		const width = Module._web_framebuffer_width();
		const height = Module._web_framebuffer_height();
		canvas.width = width;
		canvas.height = height;
		image = ctx.createImageData(width, height);
		rgba = image.data;
		statusEl.textContent = `${width}x${height}`;
		requestAnimationFrame(tick);
	}

	main().catch((err) => {
		statusEl.textContent = err.message;
		throw err;
	});
})();
