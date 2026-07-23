import { z } from 'zod';

// W-01 の疎通確認用。backend が返し frontend が検証する最小の契約で、
// 「FE/BE が同じ zod 定義を共有して起動する」ことの実証を兼ねる。
// 実サービスのスキーマ（auth/users/matches…）は W-02 以降でここへ追加する
export const healthSchema = z.object({
	status: z.literal('ok'),
	service: z.string(),
	// ISO 8601
	time: z.string(),
});

export type Health = z.infer<typeof healthSchema>;
