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
 * shared 側は frontend の型を知らないまま済む。
 *
 * 除外するのは「何をどう送るか」を決める options、つまりワイヤー形状そのもの。
 * これはエンドポイントごとに固定で、呼び出し側が変えてよいものではない。とくに
 * `json` を残すと `{ json: false }` を渡された時点で `apiFetch` が JSON 直列化を
 * 飛ばし、`{ email, password }` が `"[object Object]"` として Content-Type 無しで
 * 飛ぶ（サーバの zod 検証に到達しない）。`headers` も Content-Type を上書きできて
 * しまい同じ結果になるため一緒に外す。multipart のような別エンコードが要る
 * エンドポイント（B-06 のアバター等）は、ヘルパー側がそう宣言する。
 *
 * 逆に残るのは「その呼び出しをアプリ内でどう振る舞わせるか」の options
 * （`signal` と、requester 固有の `toast` / `onError` など）。
 */
export type RequestExtras<R extends ApiRequester> = Omit<
	NonNullable<Parameters<R['request']>[1]>,
	'method' | 'body' | 'schema' | 'json' | 'headers'
>;

/**
 * 呼び出し側から受け取った追加オプションのうち、ワイヤー形状を決めるものを実行時にも落とす。
 *
 * `RequestExtras` が型で除外しているので TypeScript の呼び出しではそもそも渡せないが、
 * 型を経由しない経路（JS からの呼び出し、`as any`）でも上書きされないようにする二重の歯止め。
 * `opts` の形は requester ごとに違う（`toast` / `onError` など）ため、ここだけ
 * `Record<string, unknown>` として扱う。
 */
export function callerExtras<R extends ApiRequester>(opts: RequestExtras<R> | undefined): object {
	const { json, headers, ...rest } = (opts ?? {}) as Record<string, unknown>;
	return rest;
}
