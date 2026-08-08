// B-10: sim.wasm のロードと呼び出しを1ファイルに閉じ込める。
// **ここ以外から wasm のポインタ・ヒープを触らないこと**（② §6-B）。
// 呼び出し順の正本は 3-エンジンPhase3レポート「B-10 への申し送り」1。
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// emcc が生成する sim.js は CommonJS。ルート package.json の "type": "module" が
// これを ESM と誤認して `createSim is not a function` になる回帰が過去に CI を
// 落としている（⑥ §6 の教訓）。必ず createRequire 経由で読む。
const require = createRequire(import.meta.url);

// I-15（docker）でレイアウトが変わりうるので環境変数で上書き可能にしておく
const SIM_JS_PATH =
	process.env.SIM_WASM_PATH ??
	fileURLToPath(new URL('../../../../web/build/sim.js', import.meta.url));

/** 入力源（codes/includes/enemy/enemy_types.h の t_input_src と一致） */
export const INPUT_SRC_AI = 0;
export const INPUT_SRC_EXTERNAL = 1;

/** snapshot 用に確保する f64 の個数。header 5 + 9/体 なので RSP 4 席で 41 */
const SNAPSHOT_MAX_DOUBLES = 256;

/** 席の入力。yaw は絶対角で、クライアント権威としてそのまま席の向きになる（申し送り 7） */
export interface SeatInput {
	forward: boolean;
	backward: boolean;
	strafeLeft: boolean;
	strafeRight: boolean;
	yaw: number;
}

export const NEUTRAL_INPUT: SeatInput = {
	forward: false,
	backward: false,
	strafeLeft: false,
	strafeRight: false,
	yaw: 0,
};

/** emcc の MODULARIZE 出力。EXPORTED_FUNCTIONS で公開した分だけを型として書く */
interface SimModule {
	_sim_create(cubTextPtr: number, isRsp: number, targetScore: number, seed: number): number;
	_sim_set_input(
		game: number,
		combatantId: number,
		forward: number,
		backward: number,
		strafeLeft: number,
		strafeRight: number,
		yaw: number,
	): number;
	_game_add_combatant(game: number, slot: number, isAi: number): number;
	_game_set_input_source(game: number, combatantId: number, source: number): number;
	_game_step(game: number, dt: number): number;
	_game_snapshot(game: number, buf: number, maxDoubles: number): number;
	_game_destroy(game: number): void;
	_malloc(size: number): number;
	_free(ptr: number): void;
	HEAPU8: Uint8Array;
	HEAPF64: Float64Array;
}

type SimModuleFactory = () => Promise<SimModule>;

let factory: SimModuleFactory | null = null;

/**
 * sim.wasm のインスタンスを**新規に**作る。
 *
 * ② §6 の「1試合 = 1ルーム = 1つの `sim.wasm` インスタンス」に従い、
 * ルームごとに別インスタンスを持つ。1モジュールで複数 game を併走させることも
 * 技術的には可能（E-11 で確認済み）だが、**メモリ成長とクラッシュ隔離**のため
 * 設計どおり分ける（申し送り 8）。1ルームの暴走が他ルームを道連れにしない。
 *
 * require 自体は Node が結果をキャッシュするので、2回目以降は wasm の
 * インスタンス化コストだけになる。
 */
export async function createSimModule(): Promise<SimModule> {
	factory ??= require(SIM_JS_PATH) as SimModuleFactory;
	return factory();
}

export interface SimGameOptions {
	/** .cub の中身そのもの。ファイルの解決はルーム層の外（B-14）の責務 */
	cubText: string;
	mode: 'rsp' | 'fps';
	/** 1 以上で有効。0 以下は既定値。製品仕様の 3–21 検証は B-11 №6 の責務 */
	targetScore: number;
	/** 0 = 時刻由来（本番） / 非 0 = 乱数系列固定（テスト・再現用。申し送り 5） */
	seed: number;
}

/**
 * 1試合ぶんの `t_game` を保持するハンドル。
 * wasm のポインタ演算はすべてこのクラスの内側で完結させる。
 */
export class SimGame {
	private readonly module: SimModule;
	private readonly game: number;
	private readonly snapshotPtr: number;
	private destroyed = false;

	private constructor(module: SimModule, game: number) {
		this.module = module;
		this.game = game;
		this.snapshotPtr = module._malloc(8 * SNAPSHOT_MAX_DOUBLES);
	}

	static async create(options: SimGameOptions): Promise<SimGame> {
		const module = await createSimModule();
		const textPtr = writeCString(module, options.cubText);
		let game: number;
		try {
			game = module._sim_create(
				textPtr,
				options.mode === 'rsp' ? 1 : 0,
				options.targetScore,
				options.seed,
			);
		} finally {
			module._free(textPtr);
		}
		// スポーン不足のマップなどで NULL が返る（申し送り 3）。必ず見ること
		if (!game) {
			throw new Error('sim_create failed (マップのスポーン数か .cub の内容を確認)');
		}
		return new SimGame(module, game);
	}

	/**
	 * 席を作る。**人間の席も最初は AI で生成**し、join 時に入力源を切り替える運用
	 * （② §6-B）。これで接続タイミングに関係なく試合が成立する。
	 */
	addCombatant(slot: number, isAi: boolean): void {
		this.assertAlive();
		const id = this.module._game_add_combatant(this.game, slot, isAi ? 1 : 0);
		if (id !== slot) {
			throw new Error(`game_add_combatant(${slot}) failed (returned ${id})`);
		}
	}

	/** join / 切断（B-12）での AI ⇔ 人間の付け替え */
	setInputSource(combatantId: number, source: number): void {
		this.assertAlive();
		if (this.module._game_set_input_source(this.game, combatantId, source) === 0) {
			throw new Error(`game_set_input_source(${combatantId}, ${source}) failed`);
		}
	}

	/** EXTERNAL な席にのみ効く。AI 席へ送っても無視される */
	setInput(combatantId: number, input: SeatInput): void {
		this.assertAlive();
		this.module._sim_set_input(
			this.game,
			combatantId,
			input.forward ? 1 : 0,
			input.backward ? 1 : 0,
			input.strafeLeft ? 1 : 0,
			input.strafeRight ? 1 : 0,
			input.yaw,
		);
	}

	/** @returns true なら決着。以後 step しても状態は進まない（申し送り 6） */
	step(dt: number): boolean {
		this.assertAlive();
		return this.module._game_step(this.game, dt) === 1;
	}

	/**
	 * フラット f64 の snapshot を読む。
	 *
	 * 返す view は **次の wasm 呼び出しまでしか有効でない**。ALLOW_MEMORY_GROWTH で
	 * ヒープが再確保されると古い view は detach するため、毎回作り直している。
	 * 呼び出し側は即座に decodeSnapshot() へ渡してデコードすること。
	 */
	readSnapshot(): Float64Array {
		this.assertAlive();
		const n = this.module._game_snapshot(this.game, this.snapshotPtr, SNAPSHOT_MAX_DOUBLES);
		if (n < 5) {
			throw new Error(`game_snapshot failed (${n})`);
		}
		return new Float64Array(this.module.HEAPF64.buffer, this.snapshotPtr, n);
	}

	destroy(): void {
		if (this.destroyed) return;
		this.destroyed = true;
		this.module._game_destroy(this.game);
		this.module._free(this.snapshotPtr);
	}

	private assertAlive(): void {
		if (this.destroyed) {
			throw new Error('SimGame は destroy 済み');
		}
	}
}

/** JS の文字列を wasm ヒープ上の NUL 終端 C 文字列にする。戻り値は呼び出し側が free する */
function writeCString(module: SimModule, text: string): number {
	const bytes = new TextEncoder().encode(text);
	const ptr = module._malloc(bytes.length + 1);
	module.HEAPU8.set(bytes, ptr);
	module.HEAPU8[ptr + bytes.length] = 0;
	return ptr;
}
