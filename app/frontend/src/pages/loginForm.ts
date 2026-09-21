import type { LoginRequest } from '@ft/shared';
import type { ZodIssue } from 'zod';

import { ApiError } from '../api/apiError.js';

// F-03(#172/#162)。LoginPage の描画から切り離した判断部分。
// vitest は environment: 'node'（app/frontend/vite.config.ts に test 節が無い）で
// DOM が無いため、画面を描かずに検証できるのはここに置いた純関数だけになる。

export type FieldErrors = Partial<Record<keyof LoginRequest | 'form', string>>;

function isFieldName(value: unknown): value is keyof LoginRequest {
	return value === 'email' || value === 'password';
}

/** zod の issue を、この画面の文言へ落とす */
function validationMessage(issue: ZodIssue): string {
	const field = issue.path[0];

	if (field === 'email') {
		return 'メールアドレスの形式で入力してください';
	}
	if (field === 'password') {
		if (issue.code === 'too_small') return 'パスワードは8文字以上で入力してください';
		if (issue.code === 'too_big') return 'パスワードは128文字以内で入力してください';
	}
	return '入力内容を確認してください';
}

/** 送信前検証。フィールドごとに最初の1件だけ出す（SignupPage の zodFieldErrors と同じ流儀） */
export function zodFieldErrors(issues: ZodIssue[]): FieldErrors {
	const errors: FieldErrors = {};

	for (const issue of issues) {
		const field = issue.path[0];
		if (isFieldName(field) && !errors[field]) {
			errors[field] = validationMessage(issue);
		}
	}

	return errors;
}

/** サーバのエラー code を、この画面の文言へ落とす */
export function loginApiError(err: ApiError): FieldErrors {
	// メール不存在とパスワード誤りをサーバが区別しない（③§1-B の列挙攻撃対策）ので、
	// 画面でも区別しない。ここを分けると対策が無意味になる
	if (err.code === 'unauthenticated') {
		return { form: 'メールアドレスまたはパスワードが違います' };
	}
	// POST も ③§1-C のレート制限対象。429 を汎用文言に丸めると「何をすれば直るか」が消える
	if (err.code === 'rate_limited') {
		return { form: '試行が多すぎます。1分ほど待ってからもう一度お試しください' };
	}
	if (err.code === 'validation_failed' && err.details) {
		const errors: FieldErrors = {};
		for (const [field, message] of Object.entries(err.details)) {
			if (isFieldName(field)) errors[field] = message;
		}
		if (Object.keys(errors).length > 0) return errors;
	}
	return { form: err.message || 'ログインに失敗しました' };
}
