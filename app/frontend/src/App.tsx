import { Navigate, Route, Routes } from 'react-router-dom';

import { Layout } from './components/Layout.js';
import { RedirectIfAuth } from './components/RedirectIfAuth.js';
import { RequireAuth } from './components/RequireAuth.js';
import { useAuth } from './contexts/AuthContext.js';

import DesignSystemPage from './pages/DesignSystemPage.js';
import GameView from './pages/GameView.js';
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
					path="/lobby"
					element={
						<RequireAuth>
							<LobbyPage />
						</RequireAuth>
					}
				/>
				{/* #109 / #110 は別 Issue。#106 からの遷移先として枠だけ置く */}
				<Route
					path="/lobby/create"
					element={
						<RequireAuth>
							<RoomCreatePage />
						</RequireAuth>
					}
				/>
				<Route
					path="/lobby/join"
					element={
						<RequireAuth>
							<RoomJoinPage />
						</RequireAuth>
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

			{/* Layout 外（全画面 Canvas） */}
			<Route
				path="/game/:roomId"
				element={
					<RequireAuth>
						<GameView />
					</RequireAuth>
				}
			/>
		</Routes>
	);
}
