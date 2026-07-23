import { useEffect, useState } from 'react';
import { healthSchema, type Health } from '@ft/shared';

// W-01 の骨格画面。backend との疎通を shared の zod スキーマで検証して表示し、
// 「FE/BE が同じ契約を共有して起動する」ことを目に見える形で示す。
// 実画面（ロビー・GameView・プロフィール）は F-01 以降で置き換える
export default function App() {
	const [health, setHealth] = useState<Health | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const controller = new AbortController();
		fetch('/api/health', { signal: controller.signal })
			.then((res) => res.json())
			.then((json: unknown) => {
				// レスポンスは必ず共有スキーマで検証する（③§1-B の FE 側検証）
				setHealth(healthSchema.parse(json));
			})
			.catch((err: unknown) => {
				if (err instanceof Error && err.name === 'AbortError') {
					return;
				}
				setError(err instanceof Error ? err.message : String(err));
			});
		return () => {
			controller.abort();
		};
	}, []);

	return (
		<main className="min-h-screen bg-slate-900 p-8 text-slate-100">
			<h1 className="text-2xl font-bold">ft_transcendence</h1>
			<p className="mt-2 text-slate-400">
				W-01 リポジトリ骨格。画面の実装は F-01 以降。
			</p>
			<section className="mt-6 rounded-lg border border-slate-700 bg-slate-800 p-4">
				<h2 className="font-semibold">backend 疎通（/api/health）</h2>
				{health && (
					<p className="mt-2 text-emerald-400">
						{health.status} — {health.service} @ {health.time}
					</p>
				)}
				{error && <p className="mt-2 text-rose-400">未接続: {error}</p>}
				{!health && !error && <p className="mt-2 text-slate-400">確認中…</p>}
			</section>
		</main>
	);
}
