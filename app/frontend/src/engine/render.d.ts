// render.wasm の TS 型（Emscripten Module の必要分だけ）。
// エクスポート一覧は Makefile の WEB_LDFLAGS の EXPORTED_FUNCTIONS に対応する。

export interface CreateModuleOptions {
	/** wasm 本体を fetch する URL を返す。既定は glue と同じディレクトリ */
	locateFile?: (path: string) => string;
	print?: (msg: string) => void;
	printErr?: (msg: string) => void;
}

export interface RenderModule {
	// メモリ確保
	_malloc: (size: number) => number;
	_free: (ptr: number) => void;

	// マップとテクスチャの初期化
	/** @returns 0=失敗 / 非0=成功 */
	_web_init: (mapPtr: number, isRsp: number, resW: number, resH: number) => number;
	/** @returns 0=失敗 / 非0=成功 */
	_web_register_texture: (
		pathPtr: number,
		dataPtr: number,
		width: number,
		height: number,
	) => number;

	// snapshot 経路（F-06 が使う本命）
	_web_apply_snapshot: (flatPtr: number, len: number, viewId: number) => void;
	_web_render_frame: () => void;

	// ローカル駆動用（engine_demo.html で使用。F-06 は使わない）
	_web_render: (dt: number) => void;
	_web_set_input: (
		fwd: number,
		back: number,
		strafeL: number,
		strafeR: number,
		rotL: number,
		rotR: number,
	) => void;
	_web_toggle_option: (option: number) => void;
	_web_set_weapon: (weapon: number) => void;
	_web_shoot: () => void;

	// フレームバッファ
	_web_framebuffer_ptr: () => number;
	_web_framebuffer_width: () => number;
	_web_framebuffer_height: () => number;
	_web_framebuffer_stride: () => number;

	// ヒープビュー
	HEAPU8: Uint8Array;
	HEAPF64: Float64Array;
}

export type CreateRenderModule = (opts?: CreateModuleOptions) => Promise<RenderModule>;

declare global {
	interface Window {
		createCub3DModule?: CreateRenderModule;
		/** engine_demo.html の TextDecoder shim（GATE1_REPORT）。ブラウザ以外では未定義 */
		__cub3dTextDecoder?: typeof TextDecoder;
	}
}
