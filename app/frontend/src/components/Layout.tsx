import { Outlet } from 'react-router-dom';

import { Footer } from './Footer.js';
import { Header } from './Header.js';

// ④ §2 の共通レイアウト。react-router v7 の Layout Route として使う。
// Header と Footer を常設し、中央に <Outlet /> でページ本体を出す。
// GameView（/game/:roomId）は Layout の外に配置する（④ §3.3「Header/Footer は非表示」）

export function Layout() {
	return (
		<div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
			<Header />
			<main className="flex-1">
				<Outlet />
			</main>
			<Footer />
		</div>
	);
}
