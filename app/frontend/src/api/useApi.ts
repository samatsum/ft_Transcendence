import { useCallback, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { ZodType } from 'zod';

import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { ApiError } from './apiError.js';
import { apiFetch, isAbortError, type ApiFetchOptions } from './apiFetch.js';

// F-02 の hook。pure な apiFetch に React 世界の副作用(Toast / Auth / navigate)を巻き付ける。
//
// - 401 は AuthContext を落として /login へ navigate。元 URL は state.from に積む
//   (F-01 の RequireAuth と同じ契約)。Toast は出さない(redirect が十分な feedback)
// - それ以外の ApiError は既定で Toast に出す(toast: false で抑止できる)
// - AbortError は Toast も navigate もせず再スロー
// - 呼び出し側から個別ハンドリングしたいときは onError を渡す

export interface UseApiCallOptions<T> extends ApiFetchOptions {
	schema?: ZodType<T>;
	/** true(既定) なら失敗時に Toast を出す。呼び出し側で自前表示する場合は false */
	toast?: boolean;
	/** 呼び出し側で code 別ハンドリング(Toast の後にも呼ばれる) */
	onError?: (err: ApiError) => void;
}

type Shortcut<T> = Omit<UseApiCallOptions<T>, 'method' | 'body'>;

export interface UseApiResult {
	request: <T = unknown>(url: string, opts?: UseApiCallOptions<T>) => Promise<T>;
	get: <T = unknown>(url: string, opts?: Shortcut<T>) => Promise<T>;
	post: <T = unknown>(url: string, body?: unknown, opts?: Shortcut<T>) => Promise<T>;
	put: <T = unknown>(url: string, body?: unknown, opts?: Shortcut<T>) => Promise<T>;
	patch: <T = unknown>(url: string, body?: unknown, opts?: Shortcut<T>) => Promise<T>;
	del: <T = unknown>(url: string, opts?: Shortcut<T>) => Promise<T>;
}

export function useApi(): UseApiResult {
	const { push } = useToast();
	const { setUser } = useAuth();
	const navigate = useNavigate();
	const location = useLocation();

	const request = useCallback(
		async <T = unknown>(url: string, opts: UseApiCallOptions<T> = {}): Promise<T> => {
			const { schema, toast = true, onError, ...fetchOpts } = opts;
			try {
				return await apiFetch<T>(url, fetchOpts, schema);
			} catch (err) {
				if (isAbortError(err)) throw err;
				if (err instanceof ApiError) {
					if (err.code === 'unauthenticated') {
						setUser(null);
						navigate('/login', {
							replace: true,
							state: { from: location.pathname + location.search },
						});
						// Toast は出さない(推奨決定#1)
					} else if (toast) {
						push({ kind: 'error', message: err.message });
					}
					onError?.(err);
				}
				throw err;
			}
		},
		[push, setUser, navigate, location.pathname, location.search],
	);

	const get = useCallback(
		<T = unknown>(url: string, opts?: Shortcut<T>): Promise<T> =>
			request<T>(url, { ...opts, method: 'GET' }),
		[request],
	);
	const post = useCallback(
		<T = unknown>(url: string, body?: unknown, opts?: Shortcut<T>): Promise<T> =>
			request<T>(url, { ...opts, method: 'POST', body }),
		[request],
	);
	const put = useCallback(
		<T = unknown>(url: string, body?: unknown, opts?: Shortcut<T>): Promise<T> =>
			request<T>(url, { ...opts, method: 'PUT', body }),
		[request],
	);
	const patch = useCallback(
		<T = unknown>(url: string, body?: unknown, opts?: Shortcut<T>): Promise<T> =>
			request<T>(url, { ...opts, method: 'PATCH', body }),
		[request],
	);
	const del = useCallback(
		<T = unknown>(url: string, opts?: Shortcut<T>): Promise<T> =>
			request<T>(url, { ...opts, method: 'DELETE' }),
		[request],
	);

	return useMemo(
		() => ({ request, get, post, put, patch, del }),
		[request, get, post, put, patch, del],
	);
}
