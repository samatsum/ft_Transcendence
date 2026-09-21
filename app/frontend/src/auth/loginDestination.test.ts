import { describe, expect, it } from 'vitest';

import { loginDestination } from './loginDestination.js';

// #210: pages/loginForm.test.ts から移した。中身は変えていない。
// vitest は environment: 'node' で DOM が無いため、画面は描かず純関数だけを叩く。

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

	// #186 回帰: useApi の既定だと 401 のたびに state.from が現在地('/login')で
	// 上書きされ、「打ち間違えた後は正しく入れても画面が変わらない」形で壊れた。
	// 統合版は `redirectOn401: false`（#202）で上書き自体を起こさないが、戻り先の判定でも塞ぐ。
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
