// 開発専用。F-03（ログイン/新規作成画面）が入るまでの繋ぎ。
//
// VITE_DEV_AUTOLOGIN は AuthContext の見た目を「ログイン済み」にするだけで、
// サーバ側のセッション Cookie は作らない。一方 WebSocket は Cookie でしか認証できないため、
// このままでは /ws/lobby が 4000 で切断される。
//
// そこで、子を描く前に「本物のセッションがあるか」を確かめ、無ければ使い捨てアカウントで
// signup して Cookie を作る。本番ビルドには含めない（App.tsx 側で DEV 限定にする）。

import { useEffect, useState, type ReactNode } from 'react';

async function ensureSession(): Promise<void> {
	const me = await fetch('/api/auth/me', { credentials: 'include' });
	if (me.ok) return;

	const stamp = Date.now();
	await fetch('/api/auth/signup', {
		method: 'POST',
		credentials: 'include',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			email: `dev${stamp}@example.com`,
			password: 'dev-password-1234',
			display_name: `dev${stamp % 1000000}`,
		}),
	});
}

export function DevSession({ children }: { children: ReactNode }) {
	const [ready, setReady] = useState(false);

	useEffect(() => {
		let alive = true;
		ensureSession()
			.catch(() => undefined)
			.finally(() => {
				if (alive) setReady(true);
			});
		return () => {
			alive = false;
		};
	}, []);

	if (!ready) {
		return (
			<p className="text-body text-fg-muted px-4 py-10">
				開発用セッションを準備しています…
			</p>
		);
	}
	return <>{children}</>;
}
