import { Link, useNavigate } from 'react-router-dom';

import { Button } from './Button.js';
import { useAuth } from '../contexts/AuthContext.js';

// ④ §2「Header: ロゴ（→ /lobby）、自分のアバター+名前（→ /profile/:me）、ログアウト」。
// アバター画像本体（B-06/F-09）は未実装なのでイニシャルの丸で代替。
// 「未ログイン時は Header 全体を出さない」ではなく、「ユーザ情報部分だけ非表示」にする
// （/privacy /terms は未ログインでも読めるので Header 自体は要る）

export function Header() {
	const { user, status, logout } = useAuth();
	const navigate = useNavigate();

	async function handleLogout() {
		await logout();
		navigate('/login', { replace: true });
	}

	return (
		<header className="border-b border-slate-800 bg-slate-950">
			<div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
				<Link
					to={user ? '/lobby' : '/'}
					className="text-lg font-semibold text-slate-100 hover:text-white"
				>
					ft_transcendence
				</Link>
				{status === 'authenticated' && user && (
					<div className="flex items-center gap-3">
						<Link
							to={`/profile/${user.id}`}
							className="flex items-center gap-2 rounded-md px-2 py-1 text-sm text-slate-200 hover:bg-slate-800"
						>
							<span
								className="flex h-7 w-7 items-center justify-center rounded-full bg-sky-600 text-xs font-bold text-white"
								aria-hidden
							>
								{user.displayName.charAt(0).toUpperCase()}
							</span>
							<span>{user.displayName}</span>
						</Link>
						<Button variant="ghost" onClick={handleLogout}>
							ログアウト
						</Button>
					</div>
				)}
			</div>
		</header>
	);
}
