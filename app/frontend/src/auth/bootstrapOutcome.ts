import { ApiError } from '../api/apiError.js';

// #264: 起動時の `GET /api/auth/me` が失敗したとき、それが「ログインしていない」のか
// 「サーバに訊けなかった」のかを判定する。
//
// 以前はここが無く、AbortError 以外を全部 `null`（＝未ログイン）へ丸めていた。
// そのため **バックエンドの再起動や nginx の 502 でセッションが切れたように見え**、
// `docker compose` を立て直すたびに全員がログアウトしていた（Cookie は消えていない）。
//
// 判定を純関数にしておく理由は `api/errorPolicy.ts` と同じで、AuthProvider は
// hook なので単体テストから直接呼べないため。

/** 起動時のセッション確認の結果 */
export type BootstrapOutcome = 'authenticated' | 'unauthenticated' | 'unavailable';

/**
 * 失敗の中身から「未ログイン」と「サーバに訊けなかった」を分ける。
 *
 * **サーバが `unauthenticated` を返したときだけログアウト扱いにする。**
 * `network_error`（fetch 自体の失敗）・`invalid_response`（502 の HTML など）・
 * その他のサーバエラーは、ログイン状態について何も言っていない。
 */
export function bootstrapOutcomeFromError(err: unknown): 'unauthenticated' | 'unavailable' {
	if (err instanceof ApiError && err.code === 'unauthenticated') return 'unauthenticated';
	return 'unavailable';
}
