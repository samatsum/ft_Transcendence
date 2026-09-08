import type { ZodType } from 'zod';

// #163: エンドポイント別ヘルパー（`authApi.login()` など）が「どの経路で投げるか」を
// 受け取るための最小契約。
//
// shared の依存は zod だけなので、frontend の `useApi()` の型をここから import できない。
// そこで構造的部分型で受ける（クラス継承ではなく duck typing の契約だけ書く形）。これで
//   - `useApi()` の戻り値 …… Toast / 401→/login リダイレクト付き（React 内から）
//   - `plainRequester` …… `apiFetch` を薄く包んだだけ（AuthContext の bootstrap・vitest）
// のどちらも同じヘルパーへ渡せる。
//
// backend の受入検査スクリプトから使いたくなった場合も、`request` を1つ実装すれば足りる。

export interface ApiRequestOptions<T = unknown> {
	method?: string;
	body?: unknown;
	signal?: AbortSignal;
	headers?: Record<string, string>;
	/** true(既定): body を JSON.stringify + Content-Type。multipart は false */
	json?: boolean;
	/** 渡すとレスポンスをこの zod で検証し、parse 後の値を返す */
	schema?: ZodType<T>;
}

export interface ApiRequester {
	request<T>(url: string, opts?: ApiRequestOptions<T>): Promise<T>;
}

/**
 * 渡された requester 固有の追加オプションを、その型から逆算する。
 *
 * `useApi()` を渡した呼び出しでは `toast` / `onError` がそのまま補完され型検査も効くが、
 * shared 側は frontend の型を知らないまま済む。`method` / `body` / `schema` は
 * ヘルパーが決める（エンドポイントごとに固定）ので呼び出し側からは触らせない。
 */
export type RequestExtras<R extends ApiRequester> = Omit<
	NonNullable<Parameters<R['request']>[1]>,
	'method' | 'body' | 'schema'
>;
