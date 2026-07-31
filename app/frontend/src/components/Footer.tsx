import { Link } from 'react-router-dom';

// ④ §2「Footer: Privacy Policy / Terms of Service へのリンクを全画面で常設」。
// 拒否条件「フッターから到達可能」の担保箇所。
// GameView（/game/:roomId）だけは Layout 外に置くため（③.3 の全画面 Canvas 前提）、
// そこでは match_end モーダル内に縮退表示する

export function Footer() {
	return (
		<footer className="border-t border-slate-800 bg-slate-950 py-3 text-xs text-slate-400">
			<nav className="mx-auto flex max-w-6xl items-center justify-center gap-4 px-4">
				<Link to="/privacy" className="hover:text-slate-200">
					Privacy Policy
				</Link>
				<span aria-hidden>·</span>
				<Link to="/terms" className="hover:text-slate-200">
					Terms of Service
				</Link>
			</nav>
		</footer>
	);
}
