import type { ApiErrorCode } from './apiError.js';

// #201: ApiError を受けたとき useApi が何をするかの判定だけを切り出したもの。
// useApi は hook なので単体テストから呼べない。判定を純関数にしておけば
// 「401 をリダイレクトに変えるかどうか」を回帰テストで固定できる。

export interface ErrorPolicy {
	/** false なら Toast を出さない（呼び出し側が自前で表示する） */
	toast: boolean;
	/** false なら 401 をセッション切れ扱いにせず、そのまま呼び出し側へ返す */
	redirectOn401: boolean;
}

export type ErrorAction = 'redirect' | 'toast' | 'none';

/**
 * 既定（redirectOn401: true）では 401 を「セッション切れ」とみなして /login へ送る。
 *
 * ログイン画面のように **401 が正常系**（パスワードが違う）の画面は
 * `redirectOn401: false` を渡す。渡さないと、自分自身へリダイレクトして
 * 「ログイン後に元のページへ戻る」ための戻り先が /login で上書きされる（#201）。
 */
export function decideErrorAction(code: ApiErrorCode, policy: ErrorPolicy): ErrorAction {
	// 401 のリダイレクトは Toast を出さない（推奨決定#1）。遷移そのものが通知になる
	if (code === 'unauthenticated' && policy.redirectOn401) return 'redirect';
	return policy.toast ? 'toast' : 'none';
}
