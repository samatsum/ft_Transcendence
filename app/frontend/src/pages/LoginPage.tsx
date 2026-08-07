import { Card } from '../components/Card.js';

// F-03 の担当（認証画面 + ルートガード）。ここは stub。
// F-03 が form 実装 + POST /api/auth/login + navigate(state.from) を担う

export default function LoginPage() {
	return (
		<div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
			<h1 className="text-xl font-semibold">ログイン</h1>
			<Card>
				<p className="text-sm text-slate-400">
					このページは F-03 で実装します（signup/login/ルートガード連携）。
				</p>
			</Card>
		</div>
	);
}
