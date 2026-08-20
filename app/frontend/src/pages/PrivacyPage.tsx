// F-04 の担当（Privacy/ToS 実文面 — プレースホルダー禁止）。
// F-01 では route と骨格だけ用意し、実文面（④ §3.5 の章立てどおり）は F-04 で書く。
// **F-04 で「プレースホルダー禁止」だが、着地までの空白期間は「実装予定」の
// 明示的な断り書きを出す**（拒否条件は「実データフローに即した実文面」なので
// 空ページよりは実装ステータスを明示する方が安全）

export default function PrivacyPage() {
	return (
		<article className="mx-auto flex max-w-3xl flex-col gap-4 px-4 py-12 text-slate-200">
			<h1 className="text-heading-lg">Privacy Policy</h1>
			<p className="text-body text-amber-400">
				⚠ この文面は F-04 で最終化します（④ §3.5 の章立てで実データフローに即した文面を書く）。
			</p>
			<p className="text-body text-slate-400">
				42 教育プロジェクト ft_transcendence の実運用に即した Privacy Policy を掲載予定。
				現時点では章立てのみ準備しています。
			</p>
		</article>
	);
}
