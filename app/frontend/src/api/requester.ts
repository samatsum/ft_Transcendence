import type { ApiRequester, ApiRequestOptions } from '@ft/shared';

import { apiFetch } from './apiFetch.js';

// #163: shared のエンドポイントヘルパー（`authApi.me()` など）を React の外から
// 呼ぶための requester。純粋な `apiFetch` を `ApiRequester` の形に合わせるだけで、
// Toast も 401 リダイレクトも付かない。
//
// 使い分け:
//   - 画面のイベントハンドラ …… `useApi()` を渡す（Toast / 401→/login が乗る）
//   - AuthContext の起動時 fetch・vitest …… こちらを渡す（副作用なし）
export const plainRequester: ApiRequester = {
	request<T>(url: string, opts: ApiRequestOptions<T> = {}): Promise<T> {
		// apiFetch は schema を第3引数で受ける（options とは別）ので、ここで分解する
		const { schema, ...rest } = opts;
		return apiFetch<T>(url, rest, schema);
	},
};
