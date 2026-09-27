import { LinkButton } from '../components/LinkButton.js';

// ④ §1 route 表の `*` → 404。最小限で足りる

export default function NotFoundPage() {
	return (
		<div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
			<h1 className="text-heading-lg">ページが見つかりません</h1>
			<p className="text-body text-fg-muted">URL をご確認ください。</p>
			<LinkButton to="/">ホームへ戻る</LinkButton>
		</div>
	);
}
