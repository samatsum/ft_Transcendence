import { Link } from 'react-router-dom';

// ④ §2「Footer: Privacy Policy / Terms of Service へのリンクを通常画面で常設」。
// 拒否条件「フッターから到達可能」の担保箇所。
// GameView（/game/:roomId）とそのリザルトは、試合への没入を優先して規約リンクを表示しない

export function Footer() {
	return (
		<footer className="border-t border-line-subtle bg-page py-3 text-caption text-fg-muted">
			<nav className="mx-auto flex max-w-6xl items-center justify-center gap-4 px-4">
				<Link to="/privacy" className="hover:text-fg-secondary">
					Privacy Policy
				</Link>
				<span aria-hidden>·</span>
				<Link to="/terms" className="hover:text-fg-secondary">
					Terms of Service
				</Link>
			</nav>
		</footer>
	);
}
