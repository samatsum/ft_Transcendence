import { z } from 'zod';

// B-04: ③ §2-A の認証エンドポイント契約。ワイヤーは snake_case（D-9）。
// ③ §1-B の検証ルールをそのままスキーマ化し、FE/BE 双方がこの定義で検証する。

/** RFC形式・254文字以内・小文字化して比較/保存する（③§1-B） */
export const emailSchema = z.string().trim().toLowerCase().max(254).email();

/** 8〜128文字。複雑さ要件は課さない（③§1-B、D-8） */
export const passwordSchema = z.string().min(8).max(128);

export const loginRequestSchema = z.object({
	email: emailSchema,
	password: passwordSchema,
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/** 3〜20文字・`[a-zA-Z0-9_-]` のみ。大文字小文字を無視して一意（③§1-B） */
export const displayNameSchema = z
	.string()
	.trim()
	.min(3)
	.max(20)
	.regex(/^[a-zA-Z0-9_-]+$/);

export const signupRequestSchema = z.object({
	email: emailSchema,
	password: passwordSchema,
	display_name: displayNameSchema,
});
export type SignupRequest = z.infer<typeof signupRequestSchema>;

/** self = ③§2-A。`email` は本人にのみ返す（他ユーザーのプロフィールには含めない） */
export const selfSchema = z.object({
	id: z.number().int(),
	email: z.string(),
	display_name: z.string(),
	avatar_url: z.string().nullable(),
	created_at: z.string(),
});
export type Self = z.infer<typeof selfSchema>;
