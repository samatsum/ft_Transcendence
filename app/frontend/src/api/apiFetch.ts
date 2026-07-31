import type { ZodType } from 'zod';
import { errorEnvelopeSchema } from '@ft/shared';

import { ApiError } from './apiError.js';
import { fallbackMessage } from './errorMessages.js';

// F-02 の pure コア。React 依存無し(hook 外・vitest からも呼べる)。
// Toast / navigate / AuthContext の副作用は useApi 側で持つ。
//
// - Cookie(セッション)を送るため credentials: 'same-origin' 固定。
//   本番は nginx が REST/WS を同一オリジンで振り分ける(⓪ §3.1)ので Vite dev も同じ
// - body 指定 + json:true(既定) で自動 JSON.stringify + Content-Type。
//   multipart(W-06 アバター等)は json:false + Content-Type を呼び出し側で
// - AbortError は再スロー(呼び出し側が cancel と real error を区別できる)。
//   network 失敗は ApiError('network_error') に丸めて Toast の統一路へ

export interface ApiFetchOptions {
	method?: string;
	body?: unknown;
	signal?: AbortSignal;
	headers?: Record<string, string>;
	/** true(既定): body を JSON.stringify + Content-Type: application/json。multipart は false */
	json?: boolean;
}

function toApiError(status: number, parsed: unknown): ApiError {
	const env = errorEnvelopeSchema.safeParse(parsed);
	if (env.success) {
		const { code, msg, details } = env.data.error;
		const message = msg && msg.trim().length > 0 ? msg : fallbackMessage(code);
		return new ApiError(code, message, {
			status,
			...(details ? { details } : {}),
		});
	}
	return new ApiError('invalid_response', fallbackMessage('invalid_response'), { status });
}

export async function apiFetch<T = unknown>(
	url: string,
	options: ApiFetchOptions = {},
	schema?: ZodType<T>,
): Promise<T> {
	const { method = 'GET', body, signal, headers = {}, json = true } = options;

	const finalHeaders: Record<string, string> = { ...headers };
	let finalBody: BodyInit | undefined;
	if (body !== undefined) {
		if (json) {
			// CodeRabbit 指摘: HTTP ヘッダ名は大文字小文字を区別しない。
			// 'content-type' や 'CONTENT-TYPE' で指定された場合の重複を避ける
			const hasContentType = Object.keys(finalHeaders).some(
				(k) => k.toLowerCase() === 'content-type',
			);
			if (!hasContentType) {
				finalHeaders['Content-Type'] = 'application/json';
			}
			finalBody = JSON.stringify(body);
		} else {
			finalBody = body as BodyInit;
		}
	}

	let response: Response;
	try {
		response = await fetch(url, {
			method,
			credentials: 'same-origin',
			headers: finalHeaders,
			...(finalBody !== undefined ? { body: finalBody } : {}),
			...(signal ? { signal } : {}),
		});
	} catch (err) {
		// AbortError は cancel なので再スロー。呼び出し側が isAbortError で区別する
		if (err instanceof DOMException && err.name === 'AbortError') throw err;
		throw new ApiError('network_error', fallbackMessage('network_error'));
	}

	// 204 No Content: schema が指定されていたら契約不一致
	if (response.status === 204) {
		if (schema) {
			throw new ApiError('invalid_response', fallbackMessage('invalid_response'), {
				status: 204,
			});
		}
		return undefined as T;
	}

	let parsed: unknown;
	try {
		parsed = await response.json();
	} catch {
		// 成功/失敗どちらでも非 JSON は invalid_response
		throw new ApiError('invalid_response', fallbackMessage('invalid_response'), {
			status: response.status,
		});
	}

	if (!response.ok) {
		throw toApiError(response.status, parsed);
	}

	if (!schema) return parsed as T;
	const validated = schema.safeParse(parsed);
	if (!validated.success) {
		throw new ApiError('invalid_response', fallbackMessage('invalid_response'), {
			status: response.status,
		});
	}
	return validated.data;
}

/** DOMException / native AbortError かどうか。呼び出し側の catch で cancel を無視する用 */
export function isAbortError(err: unknown): boolean {
	return err instanceof DOMException && err.name === 'AbortError';
}
