import { z } from 'zod';

import { callerExtras, type ApiRequester, type RequestExtras } from './requester.js';

// ③ §2-E: `GET /api/maps?mode=` のクエリ契約。FE/BE 双方がこの定義で検証する
// （③§1-B「全ボディ/クエリを shared/api/ の zod スキーマで検証」の実体）。
export const gameModeSchema = z.enum(['rsp', 'fps']);

export const listMapsQuerySchema = z.object({
	mode: gameModeSchema.optional(),
});

export type ListMapsQuery = z.infer<typeof listMapsQuerySchema>;

/**
 * ③§2-E: `GET /api/maps` が返す1件の形（`path` は含めない。サーバ内部の情報）。
 * バックエンドの `PublicMap`（`game/maps.ts`）と同じ形。命名衝突を避けるため
 * 型名はここでは export しない（Swagger docs 生成専用のスキーマ）
 */
const mapEntrySchema = z.object({
	id: z.string(),
	name: z.string(),
	mode: gameModeSchema,
	description: z.string(),
});

export const listMapsResponseSchema = z.array(mapEntrySchema);

export type ListMapsResponse = z.infer<typeof listMapsResponseSchema>;

// #163: `GET /api/maps` の呼び出しヘルパー。クエリ組み立て（`?mode=`）も
// ここに閉じ込め、呼び出し側が URL 文字列を手で組まなくて済むようにする
export const mapsApi = {
	/** ③§2-E `GET /api/maps?mode=`（mode 省略で全モード） */
	list<R extends ApiRequester>(
		api: R,
		query: ListMapsQuery = {},
		opts?: RequestExtras<R>,
	): Promise<ListMapsResponse> {
		const url = query.mode ? `/api/maps?mode=${encodeURIComponent(query.mode)}` : '/api/maps';
		return api.request<ListMapsResponse>(url, {
			...callerExtras<R>(opts),
			method: 'GET',
			schema: listMapsResponseSchema,
		});
	},
};
