import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useAuth } from '../contexts/AuthContext.js';

// ④ §1「認証済みなら /lobby へ」。/login と /signup に貼る。
// loading 中はスケルトンを出さず children（ログインフォーム等）を素通しにして
// 未ログイン扱いで先に描画する。復帰後に AuthContext が 'authenticated' になった時点で
// 通常のナビゲーションで /lobby へ移動する（F-03）ため、ここで待ち画面を出さない

export function RedirectIfAuth({ children }: { children: ReactNode }) {
	const { status } = useAuth();
	if (status === 'authenticated') {
		return <Navigate to="/lobby" replace />;
	}
	return <>{children}</>;
}
