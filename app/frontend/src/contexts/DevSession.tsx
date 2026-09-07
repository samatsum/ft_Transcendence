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
	const signup = await fetch('/api/auth/signup', {
		method: 'POST',
		credentials: 'include',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			email: `dev${stamp}@example.com`,
			password: 'dev-password-1234',
			display_name: `dev${stamp % 1000000}`,
		}),
	});
	// fetch は 4xx/5xx でも reject しない。ここで見ないと、Cookie が無いまま
	// ロビーを描いてしまい /ws/lobby が 4000 で切れる（原因が分かりにくい）
	if (!signup.ok) {
		throw new Error(`signup ${signup.status}`);
	}
}

type State = { kind: 'loading' } | { kind: 'ready' } | { kind: 'failed'; reason: string };

export function DevSession({ children }: { children: ReactNode }) {
	const [state, setState] = useState<State>({ kind: 'loading' });

	useEffect(() => {
		let alive = true;
		ensureSession()
			.then(() => {
				if (alive) setState({ kind: 'ready' });
			})
			.catch((error: unknown) => {
				if (!alive) return;
				setState({
					kind: 'failed',
					reason: error instanceof Error ? error.message : String(error),
				});
			});
		return () => {
			alive = false;
		};
	}, []);

	if (state.kind === 'loading') {
		return (
			<p className="text-body text-fg-muted px-4 py-10">
				開発用セッションを準備しています…
			</p>
		);
	}

	// 失敗したまま子を描くと「ロビーは出るのに WS だけ切れる」状態になり原因が追いにくい。
	// ここで止めて、バックエンドが起動しているかを疑えるようにする
	if (state.kind === 'failed') {
		return (
			<div className="flex flex-col gap-2 px-4 py-10">
				<p className="text-heading-sm text-rose-400">開発用セッションを作れませんでした</p>
				<p className="text-body text-fg-muted">
					原因: {state.reason}
					<br />
					バックエンドが起動しているか、`ALLOWED_ORIGIN` が合っているかを確認してください。
				</p>
			</div>
		);
	}

	return <>{children}</>;
}
