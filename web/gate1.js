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
	let captured = false;
	let resolutionLabel = '';

	// KeyboardEvent.code → 論理軸/アクション。native の g_hold_keys（input.c）と同じ対応
	const HOLD_KEYS = {
		KeyW: 'forward',
		KeyS: 'backward',
		KeyA: 'strafeLeft',
		KeyD: 'strafeRight',
		ArrowLeft: 'rotateLeft',
		ArrowRight: 'rotateRight',
	};
	// I/L/O トグルは native と同じく keyup で発火（web_main.c の WEB_OPTION_* に対応）
	const TOGGLE_KEYS = { KeyI: 0, KeyL: 1, KeyO: 2 };
	const held = {
		forward: 0, backward: 0, strafeLeft: 0,
		strafeRight: 0, rotateLeft: 0, rotateRight: 0,
	};

	function locateFile(path) {
		if (path.endsWith('.wasm')) {
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

	// wall/ と object/ は .cub が参照する2カテゴリ（USER_DOC §4）なのでマップテキストに
	// 現れるパスだけ読む。他ディレクトリ（enemy/hand/arm/interact/full）はモード組込み
	// アセットで C 側のパス列挙 API を持たないため、常に読む（D-16 のパス契約）
	function isRequired(entry, mapText) {
		if (entry.path.startsWith('textures/wall/') || entry.path.startsWith('textures/object/')) {
			return mapText.includes(entry.path);
		}
		return true;
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

	function sendInput() {
		if (!moduleRef) {
			return;
		}
		moduleRef._web_set_input(
			held.forward, held.backward, held.strafeLeft,
			held.strafeRight, held.rotateLeft, held.rotateRight,
		);
	}

	function clearInput() {
		for (const key of Object.keys(held)) {
			held[key] = 0;
		}
		sendInput();
	}

	function setCaptured(next) {
		captured = next;
		if (!captured) {
			clearInput();
		}
		statusEl.textContent = captured
			? `${resolutionLabel} — 操作中 (Esc で解除)`
			: `${resolutionLabel} — クリックで操作開始`;
	}

	function onKeyDown(event) {
		if (!captured) {
			return;
		}
		if (HOLD_KEYS[event.code]) {
			event.preventDefault();
			held[HOLD_KEYS[event.code]] = 1;
			sendInput();
		} else if (event.code in TOGGLE_KEYS || event.code === 'Escape') {
			event.preventDefault();
		}
	}

	function onKeyUp(event) {
		if (!captured) {
			return;
		}
		if (HOLD_KEYS[event.code]) {
			event.preventDefault();
			held[HOLD_KEYS[event.code]] = 0;
			sendInput();
		} else if (event.code in TOGGLE_KEYS) {
			event.preventDefault();
			moduleRef._web_toggle_option(TOGGLE_KEYS[event.code]);
		} else if (event.code === 'Escape') {
			event.preventDefault();
			setCaptured(false);
		}
	}

	function setupInput() {
		canvas.addEventListener('click', () => {
			canvas.focus();
			setCaptured(true);
		});
		window.addEventListener('keydown', onKeyDown);
		window.addEventListener('keyup', onKeyUp);
		// タブ非表示・フォーカス喪失時は全キー解放（押しっぱなし事故の防止）
		document.addEventListener('visibilitychange', () => {
			if (document.hidden) {
				clearInput();
			}
		});
		window.addEventListener('blur', clearInput);
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

	function initGame(Module, mapText) {
		const mapPtr = writeCString(Module, mapText);
		const ok = Module._web_init(mapPtr);
		Module._free(mapPtr);
		return ok;
	}

	async function main() {
		const mapResponse = await fetch('../maps/fps_map/1.cub');
		if (!mapResponse.ok) {
			throw new Error('map fetch failed');
		}
		const mapText = await mapResponse.text();
		const Module = await createCub3DModule({ locateFile });
		if (window.__cub3dTextDecoder) {
			// gate1.html の shim で隠した TextDecoder を復元する（glue はもう参照しない）
			window.TextDecoder = window.__cub3dTextDecoder;
		}
		moduleRef = Module;
		const manifestResponse = await fetch('assets/manifest.json');
		if (!manifestResponse.ok) {
			throw new Error('texture manifest fetch failed');
		}
		const manifest = await manifestResponse.json();
		const required = manifest.filter((entry) => isRequired(entry, mapText));
		statusEl.textContent = `loading ${required.length}/${manifest.length} textures`;
		await Promise.all(required.map((entry) => loadTexture(Module, entry)));
		if (!initGame(Module, mapText)) {
			throw new Error('web_init failed');
		}
		const width = Module._web_framebuffer_width();
		const height = Module._web_framebuffer_height();
		canvas.width = width;
		canvas.height = height;
		image = ctx.createImageData(width, height);
		rgba = image.data;
		resolutionLabel = `${width}x${height}`;
		setupInput();
		setCaptured(false);
		requestAnimationFrame(tick);
	}

	main().catch((err) => {
		statusEl.textContent = err.message;
		throw err;
	});
})();
