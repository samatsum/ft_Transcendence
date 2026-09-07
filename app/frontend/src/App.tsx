import { Navigate, Outlet, Route, Routes } from 'react-router-dom';

import { Layout } from './components/Layout.js';
import { RedirectIfAuth } from './components/RedirectIfAuth.js';
import { RequireAuth } from './components/RequireAuth.js';
import { useAuth } from './contexts/AuthContext.js';
import { DevSession } from './contexts/DevSession.js';
import { LobbyProvider } from './contexts/LobbyContext.js';

import DesignSystemPage from './pages/DesignSystemPage.js';
import GameView from './pages/GameView.js';
import HowToPlayPage from './pages/HowToPlayPage.js';
import LobbyPage from './pages/LobbyPage.js';
import RoomCreatePage from './pages/RoomCreatePage.js';
import RoomJoinPage from './pages/RoomJoinPage.js';
import LoginPage from './pages/LoginPage.js';
import NotFoundPage from './pages/NotFoundPage.js';
import PrivacyPage from './pages/PrivacyPage.js';
import ProfilePage from './pages/ProfilePage.js';
import SignupPage from './pages/SignupPage.js';
import TermsPage from './pages/TermsPage.js';

// ④ §1 のルート表を実装。
// - Layout Route（Header/Footer あり）と GameView（Layout 外・全画面 Canvas）で
//   親を分ける（④ §3.3「Header/Footer は非表示」）
// - `/` は auth 状態で /lobby or /login にリダイレクト
// - 未認証で保護ルート → /login（元 URL は state.from で運ぶ）
// - 認証済みで /login /signup → /lobby

function RootRedirect() {
	const { status } = useAuth();
	if (status === 'loading') {
		return (
			<div className="flex min-h-screen items-center justify-center text-body text-slate-400">
				確認中…
			</div>
		);
	}
	return <Navigate to={status === 'authenticated' ? '/lobby' : '/login'} replace />;
}

// ロビーWS を共有する枝。/lobby 配下と対戦画面が1本の接続を使う。
// Provider を各ページの element に置くと、画面を移るたびに unmount されて接続が切れる。
// 対戦画面まで含めるのは、試合結果(match_result)がゲームWSではなくロビーWSに届くため
function LobbyScope() {
	const scoped = (
		<LobbyProvider>
			<Outlet />
		</LobbyProvider>
	);
	return import.meta.env.DEV ? <DevSession>{scoped}</DevSession> : scoped;
}

export default function App() {
	return (
		<Routes>
			{/* Layout 付き（Header/Footer あり）— 対戦画面以外の全ページ */}
			<Route element={<Layout />}>
				<Route path="/" element={<RootRedirect />} />
				<Route
					path="/login"
					element={
						<RedirectIfAuth>
							<LoginPage />
						</RedirectIfAuth>
					}
				/>
				<Route
					path="/signup"
					element={
						<RedirectIfAuth>
							<SignupPage />
						</RedirectIfAuth>
					}
				/>
				<Route
					path="/profile/:id"
					element={
						<RequireAuth>
							<ProfilePage />
						</RequireAuth>
					}
				/>
				{/* Privacy / Terms は未認証でも読める（④ §1 route 表） */}
				<Route path="/privacy" element={<PrivacyPage />} />
				<Route path="/terms" element={<TermsPage />} />
				{/* 開発用デザインシステムカタログ。本番ビルドには含めない */}
				{import.meta.env.DEV && (
					<Route path="/dev/design-system" element={<DesignSystemPage />} />
				)}
				<Route path="*" element={<NotFoundPage />} />
			</Route>

			{/* ロビーWS を共有する枝。Layout の内外にまたがるので、Layout の分岐より上に置く */}
			<Route element={<RequireAuth><LobbyScope /></RequireAuth>}>
				{/* Layout 付き（Header/Footer あり） */}
				<Route element={<Layout />}>
					<Route path="/lobby" element={<LobbyPage />} />
					<Route path="/lobby/create" element={<RoomCreatePage />} />
					<Route path="/lobby/join" element={<RoomJoinPage />} />
					<Route path="/lobby/how-to" element={<HowToPlayPage />} />
				</Route>
				{/* Layout 外（全画面 Canvas。④ §3.3「Header/Footer は非表示」） */}
				<Route path="/game/:roomId" element={<GameView />} />
			</Route>
		</Routes>
	);
}
