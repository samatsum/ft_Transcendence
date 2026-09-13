import { describe, expect, it } from 'vitest';
import { loginRequestSchema } from '@ft/shared';

import { ApiError } from '../api/apiError.js';
import { loginApiError, loginDestination, zodFieldErrors } from './loginForm.js';

// F-03(#172/#162)。LoginPage の判断部分の回帰。
// vitest は environment: 'node' で DOM が無いため、画面は描かず純関数だけを叩く。

/** 画面と同じ経路（safeParse → zodFieldErrors）を通す */
function validate(email: string, password: string) {
	const parsed = loginRequestSchema.safeParse({ email, password });
	return parsed.success ? {} : zodFieldErrors(parsed.error.issues);
}

describe('zodFieldErrors', () => {
	it('メール形式が不正なら email に文言を出す', () => {
		expect(validate('not-an-email', 'password123')).toEqual({
			email: 'メールアドレスの形式で入力してください',
		});
	});

	it('パスワードが8文字未満なら password に文言を出す', () => {
		expect(validate('user@example.test', 'short')).toEqual({
			password: 'パスワードは8文字以上で入力してください',
		});
	});

	it('パスワードが128文字を超えたら長さ超過の文言を出す', () => {
		expect(validate('user@example.test', 'a'.repeat(129))).toEqual({
			password: 'パスワードは128文字以内で入力してください',
		});
	});

	it('両方不正なら両方のフィールドに出す', () => {
		expect(validate('bad', 'short')).toEqual({
			email: 'メールアドレスの形式で入力してください',
			password: 'パスワードは8文字以上で入力してください',
		});
	});

	it('正しい入力なら何も出さない', () => {
		expect(validate('user@example.test', 'password123')).toEqual({});
	});
});

describe('loginApiError', () => {
	it('401 はメール不存在とパスワード誤りを区別しない（③§1-B の列挙攻撃対策）', () => {
		const errors = loginApiError(
			new ApiError('unauthenticated', 'invalid credentials', { status: 401 }),
		);
		expect(errors).toEqual({ form: 'メールアドレスまたはパスワードが違います' });
		// フィールド側に出すと「このメールは存在する」が漏れる
		expect(errors.email).toBeUndefined();
	});

	it('429 は待てば直ると分かる文言にする', () => {
		expect(
			loginApiError(new ApiError('rate_limited', 'too many requests', { status: 429 })),
		).toEqual({ form: '試行が多すぎます。1分ほど待ってからもう一度お試しください' });
	});

	it('validation_failed の details はフィールドへ配る', () => {
		expect(
			loginApiError(
				new ApiError('validation_failed', 'invalid', {
					status: 400,
					details: { email: 'サーバ側の文言', unknown_field: '無視される' },
				}),
			),
		).toEqual({ email: 'サーバ側の文言' });
	});

	it('details が既知フィールドを1つも含まなければ form に落とす', () => {
		expect(
			loginApiError(
				new ApiError('validation_failed', 'invalid', {
					status: 400,
					details: { unknown_field: 'これだけ' },
				}),
			),
		).toEqual({ form: 'invalid' });
	});

	it('知らない code はサーバの message をそのまま出す', () => {
		expect(loginApiError(new ApiError('network_error', '通信に失敗しました'))).toEqual({
			form: '通信に失敗しました',
		});
	});

	it('message が空なら既定の文言にする', () => {
		expect(loginApiError(new ApiError('internal_error', ''))).toEqual({
			form: 'ログインに失敗しました',
		});
	});
});

describe('loginDestination', () => {
	it('RequireAuth が積んだ元 URL へ戻す', () => {
		expect(loginDestination({ from: '/lobby/create' })).toBe('/lobby/create');
	});

	it('クエリ付きの元 URL も保つ（RequireAuth は pathname + search を積む）', () => {
		expect(loginDestination({ from: '/lobby?tab=join' })).toBe('/lobby?tab=join');
	});

	it.each([
		['state が無い', null],
		['from が無い', {}],
		['from が文字列でない', { from: 42 }],
		['絶対 URL', { from: 'https://evil.example/steal' }],
		['scheme-relative', { from: '//evil.example/steal' }],
		['バックスラッシュ', { from: '/\\evil.example' }],
	])('%s なら /lobby に落とす', (_name, state) => {
		expect(loginDestination(state)).toBe('/lobby');
	});

	// #186 回帰: useApi 経由だと 401 のたびに state.from が現在地('/login')で
	// 上書きされ、「打ち間違えた後は正しく入れても画面が変わらない」形で壊れた。
	// 統合版は plainRequester を使うので上書き自体が起きないが、戻り先の判定でも塞ぐ
	// 末尾スラッシュと大文字小文字も塞ぐ（CodeRabbit 指摘 + 実測で判明した範囲）。
	// React Router 7 の matchRoutes は '/login/' も '/LOGIN' も /login ルートに入れる
	it.each([
		'/login',
		'/login?from=%2Flobby',
		'/signup',
		'/login/',
		'/signup/',
		'/LOGIN',
		'/Login/',
		'/login/?next=%2Flobby',
	])('認証画面 %s へは戻さない', (from) => {
		expect(loginDestination({ from })).toBe('/lobby');
	});

	it('似ているだけのパスは弾かない', () => {
		expect(loginDestination({ from: '/loginhelp' })).toBe('/loginhelp');
		expect(loginDestination({ from: '/lobby/login-guide' })).toBe('/lobby/login-guide');
	});
});
