import { Link, useNavigate } from 'react-router-dom';

import { Button } from './Button.js';
import { useAuth } from '../contexts/AuthContext.js';

// ④ §2「Header: ロゴ（→ /lobby）、自分のアバター+名前（リンクなし）、ログアウト」。
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
		<header className="border-b border-line-subtle bg-page">
			{/*
			 * ヘッダー全体を横並びにする flex コンテナ。
			 * flex-wrap: どうしても幅が足りないときは2行に折り返してはみ出しを防ぐ。
			 * gap-y-2: 折り返したときの上下のすき間。
			 */}
			<div className="mx-auto flex h-auto min-h-14 max-w-6xl flex-wrap items-center justify-between gap-x-3 gap-y-2 px-4 py-2 sm:h-14 sm:flex-nowrap sm:py-0">
				{/*
				 * ロゴリンク。
				 * min-w-0 + truncate: flex の子はデフォルトで縮まないので、
				 * 明示的に「縮んで省略記号(…)で切っていい」と伝える。
				 * shrink-0 は付けない（ロゴ側も多少譲る）。
				 */}
				<Link
					to={user ? '/lobby' : '/'}
					className="min-w-0 truncate text-heading-sm text-fg hover:text-fg-strong"
				>
					ft_transcendence
				</Link>
	
				{status === 'authenticated' && user && (
					/*
					 * ログイン中だけ出る右側ブロック。
					 * shrink-0: 右側（ログアウトボタン）は潰さない。
					 * ml-auto: 折り返したときに右寄せにする。
					 */
					<div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
						{/*
						 * 自分のアバター+名前。プロフィール画面（F-09）は不採用なのでリンクにしない（#240）。
						 */}
						<div className="flex min-w-0 items-center gap-2 px-2 py-1 text-body text-fg-secondary">
							<span
								className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent-strong text-xs font-bold text-fg-strong"
								aria-hidden
							>
								{user.displayName.charAt(0).toUpperCase()}
							</span>
							{/*
							 * 表示名は sm(640px) 未満では非表示。
							 * 375px ではアバターだけにして Header の横幅を節約する。
							 * 非表示の間もスクリーンリーダーには sr-only 側で名前を読ませる。
							 */}
							<span className="hidden max-w-[8rem] truncate sm:inline">{user.displayName}</span>
							<span className="sr-only sm:hidden">{user.displayName}</span>
						</div>
						{/*
						 * whitespace-nowrap: 「ログアウト」を1行のまま保つ（縦折り返し防止）。
						 */}
						<Button
							variant="ghost"
							className="whitespace-nowrap px-2 sm:px-4"
							onClick={handleLogout}
						>
							ログアウト
						</Button>
					</div>
				)}
			</div>
		</header>
	);
}
