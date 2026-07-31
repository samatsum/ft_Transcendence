import { Link } from 'react-router-dom';

import { Button } from '../components/Button.js';

// ④ §1 route 表の `*` → 404。最小限で足りる

export default function NotFoundPage() {
	return (
		<div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
			<h1 className="text-2xl font-semibold">ページが見つかりません</h1>
			<p className="text-sm text-slate-400">URL をご確認ください。</p>
			<Link to="/">
				<Button variant="primary">ホームへ戻る</Button>
			</Link>
		</div>
	);
}
