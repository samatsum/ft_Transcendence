import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { ApiError } from './apiError.js';
import { apiFetch, isAbortError } from './apiFetch.js';

// mock fetch を作る。vi.stubGlobal はテストごとにリセットする
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

const userSchema = z.object({ id: z.number(), name: z.string() });

beforeEach(() => {
	vi.unstubAllGlobals();
});

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('apiFetch', () => {
	it('200 + 有効な schema → parse したデータを返す', async () => {
		mockFetch(async () => jsonResponse(200, { id: 1, name: 'alice' }));
		const data = await apiFetch('/api/x', {}, userSchema);
		expect(data).toEqual({ id: 1, name: 'alice' });
	});

	it('200 + schema 不一致 → ApiError("invalid_response")', async () => {
		mockFetch(async () => jsonResponse(200, { id: 'not-a-number' }));
		await expect(apiFetch('/api/x', {}, userSchema)).rejects.toMatchObject({
			code: 'invalid_response',
		});
	});

	it('200 + 非 JSON → ApiError("invalid_response")', async () => {
		mockFetch(async () => new Response('<html>oops</html>', { status: 200 }));
		await expect(apiFetch('/api/x')).rejects.toMatchObject({ code: 'invalid_response' });
	});

	it('204 + schema なし → undefined', async () => {
		mockFetch(async () => new Response(null, { status: 204 }));
		const r = await apiFetch('/api/x', { method: 'POST' });
		expect(r).toBeUndefined();
	});

	it('204 + schema あり → ApiError("invalid_response")（契約不一致）', async () => {
		mockFetch(async () => new Response(null, { status: 204 }));
		await expect(apiFetch('/api/x', {}, userSchema)).rejects.toMatchObject({
			code: 'invalid_response',
			status: 204,
		});
	});

	it('401 + envelope → ApiError("unauthenticated") + サーバ msg 保持', async () => {
		mockFetch(async () =>
			jsonResponse(401, { error: { code: 'unauthenticated', msg: 'セッションが切れました' } }),
		);
		const err = (await apiFetch('/api/x').catch((e: unknown) => e)) as ApiError;
		expect(err).toBeInstanceOf(ApiError);
		expect(err.code).toBe('unauthenticated');
		expect(err.status).toBe(401);
		expect(err.message).toBe('セッションが切れました');
	});

	it('500 + envelope → ApiError with envelope code', async () => {
		mockFetch(async () =>
			jsonResponse(500, { error: { code: 'internal_error', msg: '' } }),
		);
		const err = (await apiFetch('/api/x').catch((e: unknown) => e)) as ApiError;
		expect(err.code).toBe('internal_error');
		// msg 空なら日本語 fallback
		expect(err.message).toBe('サーバエラーが発生しました。');
	});

	it('500 + 非 envelope JSON → ApiError("invalid_response")', async () => {
		mockFetch(async () => jsonResponse(500, { unexpected: 'shape' }));
		const err = (await apiFetch('/api/x').catch((e: unknown) => e)) as ApiError;
		expect(err.code).toBe('invalid_response');
		expect(err.status).toBe(500);
	});

	it('fetch 自体が reject → ApiError("network_error")', async () => {
		mockFetch(async () => {
			throw new TypeError('Failed to fetch');
		});
		const err = (await apiFetch('/api/x').catch((e: unknown) => e)) as ApiError;
		expect(err).toBeInstanceOf(ApiError);
		expect(err.code).toBe('network_error');
	});

	it('AbortError は ApiError に丸めずそのまま再スロー', async () => {
		mockFetch(async () => {
			throw new DOMException('The user aborted a request.', 'AbortError');
		});
		const err: unknown = await apiFetch('/api/x').catch((e: unknown) => e);
		expect(err).not.toBeInstanceOf(ApiError);
		expect(isAbortError(err)).toBe(true);
	});

	it('body 指定 + json:true(既定) で JSON.stringify + Content-Type 付与', async () => {
		const fn = mockFetch(async () => jsonResponse(200, { ok: true }));
		await apiFetch('/api/x', { method: 'POST', body: { hello: 'world' } });
		const [, init] = fn.mock.calls[0]!;
		expect(init?.method).toBe('POST');
		expect(init?.body).toBe(JSON.stringify({ hello: 'world' }));
		expect((init?.headers as Record<string, string>)?.['Content-Type']).toBe('application/json');
	});

	it('json:false なら body をそのまま渡し Content-Type を付けない', async () => {
		const fn = mockFetch(async () => jsonResponse(200, { ok: true }));
		const form = new FormData();
		form.append('file', 'x');
		await apiFetch('/api/x', { method: 'POST', body: form, json: false });
		const [, init] = fn.mock.calls[0]!;
		expect(init?.body).toBe(form);
		expect((init?.headers as Record<string, string>)?.['Content-Type']).toBeUndefined();
	});

	it('credentials は same-origin（Cookie 認証のため必須）', async () => {
		const fn = mockFetch(async () => jsonResponse(200, {}));
		await apiFetch('/api/x');
		const [, init] = fn.mock.calls[0]!;
		expect(init?.credentials).toBe('same-origin');
	});

	it('呼び出し側が Content-Type を任意の case で指定していれば上書きしない', async () => {
		const fn = mockFetch(async () => jsonResponse(200, {}));
		await apiFetch('/api/x', {
			method: 'POST',
			body: { a: 1 },
			headers: { 'content-type': 'application/vnd.api+json' },
		});
		const [, init] = fn.mock.calls[0]!;
		const headers = init?.headers as Record<string, string>;
		// 大文字化された 'Content-Type' 側は追加されない
		expect(headers['Content-Type']).toBeUndefined();
		expect(headers['content-type']).toBe('application/vnd.api+json');
	});
});
