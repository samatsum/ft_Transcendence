// 開発専用。F-03（ログイン/新規作成画面）が入るまでの繋ぎ。
//
// VITE_DEV_AUTOLOGIN は AuthContext の見た目を「ログイン済み」にするだけで、
// サーバ側のセッション Cookie は作らない。一方 WebSocket は Cookie でしか認証できないため、
// このままでは /ws/lobby が 4000 で切断される。
//
// そこで、子を描く前に「本物のセッションがあるか」を確かめ、無ければ使い捨てアカウントで
// signup して Cookie を作る。本番ビルドには含めない（App.tsx 側で DEV 限定にする）。

import { useEffect, useState, type ReactNode } from 'react';

import { selfSchema } from '@ft/shared';

import { useAuth } from './AuthContext.js';

// 実セッションの持ち主を返す。VITE_DEV_AUTOLOGIN は id:0 の偽ユーザーを入れるため、
// これを AuthContext へ流し込まないと「自分がホストか」の判定（room.host_id との比較）が
// 常に false になり、待機画面の開始ボタンが出ない
async function ensureSession(): Promise<{ id: number; displayName: string }> {
	const me = await fetch('/api/auth/me', { credentials: 'include' });
	if (me.ok) return toUser(await me.json());

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
	return toUser(await signup.json());
}

function toUser(body: unknown): { id: number; displayName: string } {
	const parsed = selfSchema.safeParse(body);
	if (!parsed.success) throw new Error('unexpected /api/auth/me response');
	return { id: parsed.data.id, displayName: parsed.data.display_name };
}

type State = { kind: 'loading' } | { kind: 'ready' } | { kind: 'failed'; reason: string };

export function DevSession({ children }: { children: ReactNode }) {
	const { setUser } = useAuth();
	const [state, setState] = useState<State>({ kind: 'loading' });

	useEffect(() => {
		let alive = true;
		ensureSession()
			.then((user) => {
				if (!alive) return;
				// 見た目だけの偽ユーザーを、実セッションの持ち主で置き換える
				setUser(user);
				setState({ kind: 'ready' });
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
	}, [setUser]);

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
