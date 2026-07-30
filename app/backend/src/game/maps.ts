// W-14: マップのホワイトリスト。③ §2-E の表がそのままここに来る。
//
// **ユーザーアップロードは無い。** サーバ内蔵の静的な対応表だけが公開マップの
// 集合で、G-09 のマップ制作はこの表への追記で公開される（③ §2-E）。
//
// `id` は `.cub` のファイル stem。GameRoom 生成時にサーバがこの表でパスを解決し、
// 読んだテキストをそのまま `welcome.map_text` として配る（② §5-B）。
// **クライアントがマップを REST で取ることはない** ので、`GET /api/maps` が返すのは
// 一覧（選択 UI 用のメタデータ）だけで、本文は含まない。
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export type GameMode = 'rsp' | 'fps';

export interface MapEntry {
	id: string;
	name: string;
	mode: GameMode;
	/** リポジトリルートからの相対パス。API では返さない（サーバ内部の情報） */
	path: string;
	description: string;
}

/**
 * ③ §2-E のホワイトリスト（G-09 で登録・`make test` の G-09 検査対象）。
 *
 * 検証条件は `codes/tests/sim_test.c` が常設で担保している:
 *   RSP = 赤(N/W)2席 + 青(S/E)2席が別マスで成立し短い試合が決着まで完走
 *   FPS = 1vs1 の2席 + 敵ハザードが成立し「全収集 → 扉 D 開放 → ゴール到達」が完走
 */
const MAPS: readonly MapEntry[] = [
	{
		id: 'rsp',
		name: 'Open Field',
		mode: 'rsp',
		path: 'maps/rsp_map/rsp.cub',
		description: '遮蔽の少ない開けた広場。接触が起きやすく展開が速い',
	},
	{
		id: 'rsp_pillars',
		name: 'Pillars',
		mode: 'rsp',
		path: 'maps/rsp_map/rsp_pillars.cub',
		description: '柱が視線を切る。手を変えてから仕掛ける駆け引き向き',
	},
	{
		id: '21x21_arena',
		name: 'Arena 21',
		mode: 'fps',
		path: 'maps/fps_map/21x21_arena.cub',
		description: '正方形の闘技場。収集アイテムが散開しており移動距離で競る',
	},
	{
		id: 'fps_duel',
		name: 'Duel Run',
		mode: 'fps',
		path: 'maps/fps_map/fps_duel.cub',
		description: '2人同時スタートのレース路。ハザードが関門を守る',
	},
] as const;

/** 各モードの既定マップ（② §4-B の `rules.map` 省略時） */
const DEFAULT_MAP_ID: Record<GameMode, string> = { rsp: 'rsp', fps: 'fps_duel' };

/** ③ §2-E: `GET /api/maps` が返す形。**`path` は含めない**（サーバ内部の情報） */
export interface PublicMap {
	id: string;
	name: string;
	mode: GameMode;
	description: string;
}

export function listMaps(mode?: GameMode): PublicMap[] {
	return MAPS.filter((m) => !mode || m.mode === mode).map(({ id, name, mode: m, description }) => ({
		id,
		name,
		mode: m,
		description,
	}));
}

export function findMap(id: string): MapEntry | undefined {
	return MAPS.find((m) => m.id === id);
}

export function defaultMapId(mode: GameMode): string {
	return DEFAULT_MAP_ID[mode];
}

/**
 * マップ ID を `.cub` テキストへ解決する。**GameRoom 生成の直前に呼ぶ**。
 *
 * ここで読んだテキストがそのまま `welcome.map_text` になるので、
 * **サーバがロードした内容と配布テキストが常に一致する**（W-14 の受入条件）。
 * ホワイトリストに無い ID は解決しない＝任意パス読み出しが構造的に起きない。
 */
export function loadMapText(id: string): { entry: MapEntry; text: string } {
	const entry = findMap(id);
	if (!entry) throw new Error(`map ${id} はホワイトリストに無い`);
	const abs = fileURLToPath(new URL(`../../../../${entry.path}`, import.meta.url));
	return { entry, text: readFileSync(abs, 'utf8') };
}
