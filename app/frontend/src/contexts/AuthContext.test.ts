import { authApi } from '@ft/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { plainRequester } from '../api/requester.js';
import { toAuthUser } from './AuthContext.js';

// #135回帰: `/api/auth/me` は selfSchema（③§2-A）と同じ snake_case の
// display_name を返す。これを camelCase の displayName へ正しく変換できないと、
// 200成功が黙って「未ログイン」に丸められてしまう
// （apiFetch は schema 不一致を ApiError('invalid_response') にする）。
// #163 でスキーマ検証は shared の authApi.me が持つようになったため、
// 「実レスポンス → AuthUser」の経路まるごとをここで検査する。

function mockFetch(impl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
	const fn = vi.fn(impl);
	vi.stubGlobal('fetch', fn);
	return fn;
}

function jsonResponse(status: number, body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { 'Content-Type': 'application/json' },
	});
}

beforeEach(() => {
	vi.unstubAllGlobals();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('authApi.me → toAuthUser', () => {
	it('/api/auth/me の実レスポンス形（display_name）を displayName へ変換する', async () => {
		mockFetch(async () =>
			jsonResponse(200, {
				id: 1,
				email: 'checker@example.test',
				display_name: 'checker',
				avatar_url: null,
				created_at: '2026-08-29T00:00:00.000Z',
			}),
		);
		const user = toAuthUser(await authApi.me(plainRequester));
		expect(user).toEqual({ id: 1, displayName: 'checker' });
	});
});
