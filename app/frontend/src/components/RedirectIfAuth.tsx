import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { loginDestination } from '../auth/loginDestination.js';
import { useAuth } from '../contexts/AuthContext.js';

// ④ §1「認証済みなら認証画面から出す」。/login と /signup に貼る。
// loading 中はスケルトンを出さず children（ログインフォーム等）を素通しにして
// 未ログイン扱いで先に描画する。
//
// **行き先は /lobby 固定にしないこと（#210）。** ログイン成功の瞬間、LoginPage の
// navigate(元のページ) と、setUser で authenticated になったこの Navigate が同時に走り、
// こちらが勝って /lobby へ上書きしていた。RequireAuth が積んだ state.from を
// LoginPage と同じ判定（loginDestination）で見れば、両方が同じ行き先になる。
// state.from が無い・外部 URL・認証画面自身なら loginDestination が /lobby に落とす

export function RedirectIfAuth({ children }: { children: ReactNode }) {
	const { status } = useAuth();
	const location = useLocation();

	if (status === 'authenticated') {
		return <Navigate to={loginDestination(location.state)} replace />;
	}
	return <>{children}</>;
}
