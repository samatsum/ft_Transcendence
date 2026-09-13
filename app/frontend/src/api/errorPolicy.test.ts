import { describe, expect, it } from 'vitest';

import { authApi } from '@ft/shared';

import { decideErrorAction } from './errorPolicy.js';
import type { UseApiResult } from './useApi.js';

describe('decideErrorAction', () => {
	// 既定の挙動が #201 の前と同じであることを固定する
	it('既定では 401 を /login へのリダイレクトにする', () => {
		expect(decideErrorAction('unauthenticated', { toast: true, redirectOn401: true })).toBe(
			'redirect',
		);
	});

	it('401 のリダイレクトは toast の指定に関係なく起きる', () => {
		expect(decideErrorAction('unauthenticated', { toast: false, redirectOn401: true })).toBe(
			'redirect',
		);
	});

	it('401 以外は toast: true なら Toast を出す', () => {
		expect(decideErrorAction('network_error', { toast: true, redirectOn401: true })).toBe('toast');
		expect(decideErrorAction('internal_error', { toast: true, redirectOn401: true })).toBe('toast');
	});

	it('401 以外は toast: false なら何もしない', () => {
		expect(decideErrorAction('network_error', { toast: false, redirectOn401: true })).toBe('none');
	});

	// #201 の本題: ログイン画面のように 401 が正常系の呼び出し
	it('redirectOn401: false なら 401 でもリダイレクトしない', () => {
		expect(decideErrorAction('unauthenticated', { toast: false, redirectOn401: false })).toBe(
			'none',
		);
	});

	it('redirectOn401: false でも toast: true なら Toast は出る', () => {
		expect(decideErrorAction('unauthenticated', { toast: true, redirectOn401: false })).toBe(
			'toast',
		);
	});
});

describe('redirectOn401 の受け渡し', () => {
	// #163 の RequestExtras は method / body / schema / json / headers だけを落とすので、
	// redirectOn401 は authApi のヘルパー越しでも渡せる必要がある（渡せないと
	// authApi.login を使う限りログイン画面で 401 を自前処理できない）
	it('authApi.login の opts に渡せる（型の回帰）', () => {
		const call = (api: UseApiResult) =>
			authApi.login(
				api,
				{ email: 'someone@example.com', password: 'password-1234' },
				{ redirectOn401: false, toast: false },
			);
		expect(typeof call).toBe('function');
	});
});
