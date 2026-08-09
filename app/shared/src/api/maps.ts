import { z } from 'zod';

// ③ §2-E: `GET /api/maps?mode=` のクエリ契約。FE/BE 双方がこの定義で検証する
// （③§1-B「全ボディ/クエリを shared/api/ の zod スキーマで検証」の実体）。
export const gameModeSchema = z.enum(['rsp', 'fps']);

export const listMapsQuerySchema = z.object({
	mode: gameModeSchema.optional(),
});

export type ListMapsQuery = z.infer<typeof listMapsQuerySchema>;
