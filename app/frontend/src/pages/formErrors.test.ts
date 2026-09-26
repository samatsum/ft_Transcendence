import { describe, expect, it } from 'vitest';
import { loginRequestSchema, signupRequestSchema } from '@ft/shared';
import type { ZodIssue } from 'zod';

import {
	credentialMessage,
	detailsFieldErrors,
	FALLBACK_VALIDATION_MESSAGE,
	issueFieldErrors,
} from './formErrors.js';

// #206。LoginPage / SignupPage 共通のエラー組み立て。
// 文言は実スキーマの issue から引く（手組みの issue だと schema 側の変更に気付けない）。

function issuesOf(schema: typeof loginRequestSchema | typeof signupRequestSchema, input: unknown) {
	const parsed = schema.safeParse(input);
	return parsed.success ? [] : parsed.error.issues;
}

const isLoginField = (value: unknown): value is 'email' | 'password' =>
	value === 'email' || value === 'password';

describe('credentialMessage', () => {
	it.each([
		['メール形式不正', { email: 'bad', password: 'password123' }, 'メールアドレスの形式で入力してください'],
		['パスワード短すぎ', { email: 'user@example.test', password: 'short' }, 'パスワードは8文字以上で入力してください'],
		['パスワード長すぎ', { email: 'user@example.test', password: 'a'.repeat(129) }, 'パスワードは128文字以内で入力してください'],
	])('%s', (_name, input, expected) => {
		const [issue] = issuesOf(loginRequestSchema, input);
		expect(issue && credentialMessage(issue)).toBe(expected);
	});

	it('signup スキーマの email / password でも同じ文言になる', () => {
		const issues = issuesOf(signupRequestSchema, {
			email: 'bad',
			display_name: 'valid_name',
			password: 'short',
		});
		expect(issues.map(credentialMessage)).toEqual([
			'メールアドレスの形式で入力してください',
			'パスワードは8文字以上で入力してください',
		]);
	});

	it('email / password 以外のフィールドは画面に任せる（undefined）', () => {
		const [issue] = issuesOf(signupRequestSchema, {
			email: 'user@example.test',
			display_name: 'x',
			password: 'password123',
		});
		expect(issue?.path[0]).toBe('display_name');
		expect(issue && credentialMessage(issue)).toBeUndefined();
	});
});

describe('issueFieldErrors', () => {
	const message = (issue: ZodIssue) => credentialMessage(issue) ?? FALLBACK_VALIDATION_MESSAGE;

	it('フィールドごとに最初の1件だけ出す', () => {
		const issues: ZodIssue[] = [
			{ code: 'custom', path: ['password'], message: '1件目', input: undefined },
			{ code: 'custom', path: ['password'], message: '2件目', input: undefined },
		];
		expect(issueFieldErrors(issues, isLoginField, (issue) => issue.message)).toEqual({
			password: '1件目',
		});
	});

	it('画面が知らないフィールドの issue は捨てる', () => {
		const issues = issuesOf(signupRequestSchema, {
			email: 'user@example.test',
			display_name: 'x',
			password: 'password123',
		});
		expect(issueFieldErrors(issues, isLoginField, message)).toEqual({});
	});

	it('issue が無ければ空', () => {
		expect(issueFieldErrors([], isLoginField, message)).toEqual({});
	});
});

describe('detailsFieldErrors', () => {
	it('既知フィールドだけを配る', () => {
		expect(
			detailsFieldErrors({ email: 'サーバ側の文言', unknown_field: '無視される' }, isLoginField),
		).toEqual({ email: 'サーバ側の文言' });
	});

	it('既知フィールドが無ければ空（form の文言は画面が決める）', () => {
		expect(detailsFieldErrors({ unknown_field: 'これだけ' }, isLoginField)).toEqual({});
	});

	it('details 自体が無くても空', () => {
		expect(detailsFieldErrors(undefined, isLoginField)).toEqual({});
	});
});
