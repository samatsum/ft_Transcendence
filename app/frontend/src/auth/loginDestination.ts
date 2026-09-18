// ログイン成功後の戻り先の判定（#210）。
//
// LoginPage（pages/）と RedirectIfAuth（components/）の両方が使うため、
// どちらの下にも置かず認証の領域としてここに置く。lobby/ や game/ と同じく
// 画面をまたぐ判断を領域ごとのフォルダにまとめる形。
// 送り手は RequireAuth（state.from に pathname + search を積む）。

/**
 * ログイン成功後の戻り先。`RequireAuth` が `state.from` に積んだ元 URL へ戻す。
 *
 * 値は history に残る外来データなので、次の3つは弾いて `/lobby` に落とす。
 * - `/` 始まりでない（`https://evil.example` などの絶対 URL）
 * - `//` や `/\` 始まり（scheme-relative URL として外部へ出る）
 * - 認証画面そのもの（戻った先でまた同じ画面が出る。#186 で実際に起きうる形）
 */
export function loginDestination(state: unknown): string {
	const fallback = '/lobby';

	if (typeof state !== 'object' || state === null || !('from' in state)) return fallback;

	const from = (state as { from?: unknown }).from;
	if (typeof from !== 'string') return fallback;
	if (!from.startsWith('/')) return fallback;
	if (from.startsWith('//') || from.startsWith('/\\')) return fallback;

	// React Router 7 の照合は末尾スラッシュを無視し、大文字小文字も区別しない
	// （実測: '/login/' も '/LOGIN' も /login ルートに入る）。同じ正規化をしてから比べないと
	// 素通りする
	const path = (from.split(/[?#]/, 1)[0] ?? '').replace(/\/+$/, '').toLowerCase();
	if (path === '/login' || path === '/signup') return fallback;

	return from;
}
