import { Link } from 'react-router-dom';

// ④ §1 route 表の `*` → 404。最小限で足りる。
// CodeRabbit 指摘: Link と Button の入れ子は不正 HTML なので、Link に Button 相当の
// クラスを直付けする（Button の primary variant と揃える）

export default function NotFoundPage() {
	return (
		<div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
			<h1 className="text-heading-lg">ページが見つかりません</h1>
			<p className="text-body text-slate-400">URL をご確認ください。</p>
			<Link
				to="/"
				className="inline-flex items-center justify-center gap-2 rounded-md bg-sky-500 px-4 py-2 text-label text-white transition-colors hover:bg-sky-400"
			>
				ホームへ戻る
			</Link>
		</div>
	);
}
