import { authApi, mapsApi } from '@ft/shared';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { plainRequester } from './requester.js';

// #163: shared のエンドポイントヘルパーが「どの URL へ・どのメソッドで投げ・
// 何を検証して返すか」の回帰テスト。呼び出し経路は plainRequester（副作用なし）で、
// useApi を渡した場合の Toast / 401 リダイレクトは useApi 側の責務なのでここでは見ない。

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

const SELF = {
	id: 7,
	email: 'player@example.test',
	display_name: 'player',
	avatar_url: null,
	created_at: '2026-09-06T00:00:00.000Z',
};

beforeEach(() => {
	vi.unstubAllGlobals();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('authApi', () => {
	it('login は POST /api/auth/login へ JSON を送り、self を返す', async () => {
		const fetchMock = mockFetch(async () => jsonResponse(200, SELF));
		const self = await authApi.login(plainRequester, {
			email: 'player@example.test',
			password: 'password123',
		});

		expect(self.display_name).toBe('player');
		const [url, init] = fetchMock.mock.calls[0]!;
		expect(url).toBe('/api/auth/login');
		expect(init?.method).toBe('POST');
		expect(JSON.parse(init?.body as string)).toEqual({
			email: 'player@example.test',
			password: 'password123',
		});
	});

	it('signup は POST /api/auth/signup へ投げる（201 も成功）', async () => {
		const fetchMock = mockFetch(async () => jsonResponse(201, SELF));
		await authApi.signup(plainRequester, {
			email: 'player@example.test',
			password: 'password123',
			display_name: 'player',
		});

		expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/signup');
		expect(fetchMock.mock.calls[0]![1]?.method).toBe('POST');
	});

	it('login 失敗（401 envelope）は ApiError の code へ落ちる', async () => {
		mockFetch(async () =>
			jsonResponse(401, {
				error: { code: 'unauthenticated', msg: 'メールアドレスまたはパスワードが違います' },
			}),
		);
		await expect(
			authApi.login(plainRequester, { email: 'x@example.test', password: 'password123' }),
		).rejects.toMatchObject({ code: 'unauthenticated', status: 401 });
	});

	it('logout は 204 No Content を成功として扱う', async () => {
		const fetchMock = mockFetch(async () => new Response(null, { status: 204 }));
		await expect(authApi.logout(plainRequester)).resolves.toBeUndefined();
		expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/logout');
		expect(fetchMock.mock.calls[0]![1]?.method).toBe('POST');
	});

	it('me は GET /api/auth/me を叩き、self schema で検証する', async () => {
		const fetchMock = mockFetch(async () => jsonResponse(200, SELF));
		const self = await authApi.me(plainRequester);

		expect(self.id).toBe(7);
		expect(fetchMock.mock.calls[0]![0]).toBe('/api/auth/me');
		expect(fetchMock.mock.calls[0]![1]?.method).toBe('GET');
	});

	it('me の応答が契約と違えば invalid_response（呼び出し側で握り潰さない）', async () => {
		mockFetch(async () => jsonResponse(200, { id: 7 }));
		await expect(authApi.me(plainRequester)).rejects.toMatchObject({ code: 'invalid_response' });
	});

	it('追加オプション（signal）はそのまま fetch へ渡る', async () => {
		const fetchMock = mockFetch(async () => jsonResponse(200, SELF));
		const controller = new AbortController();
		await authApi.me(plainRequester, { signal: controller.signal });

		expect(fetchMock.mock.calls[0]![1]?.signal).toBe(controller.signal);
	});
});

describe('mapsApi', () => {
	it('mode 省略時は /api/maps、指定時は ?mode= を付ける', async () => {
		const fetchMock = mockFetch(async () => jsonResponse(200, []));
		await mapsApi.list(plainRequester);
		await mapsApi.list(plainRequester, { mode: 'rsp' });

		expect(fetchMock.mock.calls[0]![0]).toBe('/api/maps');
		expect(fetchMock.mock.calls[1]![0]).toBe('/api/maps?mode=rsp');
	});

	it('レスポンスを listMapsResponseSchema で検証して返す', async () => {
		mockFetch(async () =>
			jsonResponse(200, [{ id: 'arena', name: 'Arena', mode: 'fps', description: '基本マップ' }]),
		);
		const maps = await mapsApi.list(plainRequester, { mode: 'fps' });
		expect(maps).toHaveLength(1);
		expect(maps[0]!.id).toBe('arena');
	});
});
