import type { LoginRequest } from '@ft/shared';
import type { ZodIssue } from 'zod';

import { ApiError } from '../api/apiError.js';
import {
	credentialMessage,
	detailsFieldErrors,
	FALLBACK_VALIDATION_MESSAGE,
	issueFieldErrors,
	type FormErrors,
} from './formErrors.js';

// F-03(#172/#162)。LoginPage の描画から切り離した判断部分。
// vitest は environment: 'node'（app/frontend/vite.config.ts に test 節が無い）で
// DOM が無いため、画面を描かずに検証できるのはここに置いた純関数だけになる。

type FieldName = keyof LoginRequest;
export type FieldErrors = FormErrors<FieldName>;

function isFieldName(value: unknown): value is FieldName {
	return value === 'email' || value === 'password';
}

/** 送信前検証。文言と「フィールドごとに最初の1件」は SignupPage と共通（formErrors.ts） */
export function zodFieldErrors(issues: ZodIssue[]): FieldErrors {
	return issueFieldErrors(
		issues,
		isFieldName,
		(issue) => credentialMessage(issue) ?? FALLBACK_VALIDATION_MESSAGE,
	);
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
	if (err.code === 'validation_failed') {
		const errors = detailsFieldErrors(err.details, isFieldName);
		if (Object.keys(errors).length > 0) return errors;
	}
	return { form: err.message || 'ログインに失敗しました' };
}
