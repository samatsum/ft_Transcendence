import type { ApiErrorCode } from './apiError.js';

// サーバ msg が空/欠落のときのフォールバック(推奨決定#2)。
// サーバの msg があればそれを優先し、無ければこの map から引く。
// backend(torinoue B-02) が日本語で msg を返すとは限らないため、フロント側で
// ユーザ向け文言を用意しておく。エンドポイント特有の細かい文言は呼び出し側で override

export const ERROR_MESSAGES_JA: Record<ApiErrorCode, string> = {
	network_error: '通信に失敗しました。ネットワーク状況をご確認ください。',
	invalid_response: 'サーバから想定外の応答がありました。',
	validation_failed: '入力内容にエラーがあります。',
	unauthenticated: 'ログインが必要です。',
	forbidden: 'この操作を行う権限がありません。',
	not_found: '対象が見つかりませんでした。',
	conflict: '状態が競合しました。時間をおいて再度お試しください。',
	email_taken: 'このメールアドレスは既に登録されています。',
	name_taken: 'この表示名は既に使われています。',
	already_friends: '既にフレンドです。',
	payload_too_large: 'ファイルサイズが大きすぎます。',
	unsupported_media_type: 'サポートされていないファイル形式です。',
	rate_limited: '操作が多すぎます。少しお待ちください。',
	internal_error: 'サーバエラーが発生しました。',
};

export function fallbackMessage(code: ApiErrorCode): string {
	return ERROR_MESSAGES_JA[code] ?? 'エラーが発生しました。';
}
