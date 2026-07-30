import { useEffect, useState } from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { healthSchema, type Health } from '@ft/shared';

import GameView from './pages/GameView.js';

// F-06 で React Router を先行導入。F-01（雛形整備・ErrorBoundary・共通レイアウト）は
// mamiyaza の担当のため、ここでは /game/:roomId が届く最小限のルーティングだけを置く。
// F-01 完了時にレイアウト・ガード・ErrorBoundary を差し込む前提

function HomeStub() {
	const [health, setHealth] = useState<Health | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const controller = new AbortController();
		fetch('/api/health', { signal: controller.signal })
			.then((res) => res.json())
			.then((json: unknown) => setHealth(healthSchema.parse(json)))
			.catch((err: unknown) => {
				if (err instanceof Error && err.name === 'AbortError') return;
				setError(err instanceof Error ? err.message : String(err));
			});
		return () => controller.abort();
	}, []);

	return (
		<main className="min-h-screen bg-slate-900 p-8 text-slate-100">
			<h1 className="text-2xl font-bold">ft_transcendence</h1>
			<p className="mt-2 text-slate-400">
				F-06 導入。F-01 完成までは仮の入口です。
			</p>
			<section className="mt-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
				<h2 className="font-semibold">backend 疎通(/api/health)</h2>
				{health && (
					<p className="mt-2 text-emerald-400">
						{health.status} — {health.service} @ {health.time}
					</p>
				)}
				{error && <p className="mt-2 text-rose-400">未接続: {error}</p>}
				{!health && !error && <p className="mt-2 text-slate-400">確認中…</p>}
			</section>
			<nav className="mt-6 text-sm">
				<Link className="text-sky-400 underline" to="/game/dev-room">
					/game/dev-room で GameView(F-06) を開く
				</Link>
			</nav>
		</main>
	);
}

export default function App() {
	return (
		<Routes>
			<Route path="/" element={<HomeStub />} />
			<Route path="/game/:roomId" element={<GameView />} />
			<Route path="*" element={<HomeStub />} />
		</Routes>
	);
}
