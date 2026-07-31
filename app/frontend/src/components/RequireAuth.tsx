import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';

import { useAuth } from '../contexts/AuthContext.js';

// ④ §1「未認証で保護ルートへ来たら /login へリダイレクト」+「ログイン後に元の URL へ復帰」。
// ログイン後の復帰は state.from で運ぶ（F-03 の LoginPage が state.from を読んで navigate する）。
// status='loading' の間は最小限のスケルトンを出す（フラッシュ回避）

export function RequireAuth({ children }: { children: ReactNode }) {
	const { status } = useAuth();
	const location = useLocation();

	if (status === 'loading') {
		return (
			<div className="flex min-h-[50vh] items-center justify-center text-sm text-slate-400">
				確認中…
			</div>
		);
	}
	if (status === 'unauthenticated') {
		return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
	}
	return <>{children}</>;
}
