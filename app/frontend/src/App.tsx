import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Outlet, Route, Routes, useNavigate, useParams } from 'react-router-dom';

import { Layout } from './components/Layout.js';
import { RedirectIfAuth } from './components/RedirectIfAuth.js';
import { RequireAuth } from './components/RequireAuth.js';
import { useAuth } from './contexts/AuthContext.js';
import { DevSession } from './contexts/DevSession.js';
import { LobbyProvider, useLobby } from './contexts/LobbyContext.js';
import { isGameRoomFinished } from './game/gameRouteState.js';

import DesignSystemPage from './pages/DesignSystemPage.js';
import GameView from './pages/GameView.js';
import HowToPlayPage from './pages/HowToPlayPage.js';
import LobbyPage from './pages/LobbyPage.js';
import MatchingPage from './pages/MatchingPage.js';
import RoomCreatePage from './pages/RoomCreatePage.js';
import RoomJoinPage from './pages/RoomJoinPage.js';
import LoginPage from './pages/LoginPage.js';
import NotFoundPage from './pages/NotFoundPage.js';
import PrivacyPage from './pages/PrivacyPage.js';
import ProfilePage from './pages/ProfilePage.js';
import SignupPage from './pages/SignupPage.js';
import TermsPage from './pages/TermsPage.js';

// preview module は Vite 開発時だけ動的 import する。本番 bundle へ fixture と結果画面の
// 開発導線を含めず、通常の試合進行を変えずに同じ MatchEndModal を確認できるようにする
const ResultPreviewPage = import.meta.env.DEV
	? lazy(() => import('./pages/ResultPreviewPage.js'))
	: null;

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
// マッチが成立したら、ロビーのどの画面にいても対戦画面へ送る。待機画面だけで受けると、
// ロビーへ戻っている人が試合に入れないまま取り残される。
// 遷移前に捨てるのは、試合後にロビーへ戻った瞬間に古い値でまた弾き返されないため（#157）
function MatchFoundRedirect() {
	const { matchFound, clearMatchFound } = useLobby();
	const navigate = useNavigate();

	useEffect(() => {
		if (!matchFound) return;
		const roomId = matchFound.room_id;
		clearMatchFound();
		navigate(`/game/${roomId}`, { replace: true });
	}, [matchFound, clearMatchFound, navigate]);

	return null;
}

function LobbyScope() {
	const scoped = (
		<LobbyProvider>
			<MatchFoundRedirect />
			<Outlet />
		</LobbyProvider>
	);
	return import.meta.env.DEV ? <DevSession>{scoped}</DevSession> : scoped;
}

// リザルト表示後の再読み込みでは Canvas をマウントせず、最初の描画からロビーへ戻す
// 進行中のルームには印が無いため、通常の再接続フローを維持する
function GameRoute() {
	const { roomId = '' } = useParams();
	// 初回マウント時だけ読む。対戦中に match_end が記録されても、表示中のリザルトを
	// 即座に閉じず、再読み込みや履歴からの再訪時にだけロビーへ戻す
	const [finishedBeforeMount] = useState(() => isGameRoomFinished(roomId));
	return finishedBeforeMount ? <Navigate to="/lobby" replace /> : <GameView />;
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
				{ResultPreviewPage && (
					<Route
						path="/dev/result-preview"
						element={
							<Suspense fallback={null}>
								<ResultPreviewPage variant="goal" />
							</Suspense>
						}
					/>
				)}
				{ResultPreviewPage && (
					<Route
						path="/dev/result-preview/forfeit"
						element={
							<Suspense fallback={null}>
								<ResultPreviewPage variant="forfeit" />
							</Suspense>
						}
					/>
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
					<Route path="/lobby/matching" element={<MatchingPage />} />
					<Route path="/lobby/how-to" element={<HowToPlayPage />} />
				</Route>
				{/* Layout 外（全画面 Canvas。④ §3.3「Header/Footer は非表示」） */}
				<Route path="/game/:roomId" element={<GameRoute />} />
			</Route>
		</Routes>
	);
}
