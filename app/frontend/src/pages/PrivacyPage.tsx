// F-04: ④ §3.5 の章立てに沿った実文面。プレースホルダー禁止（拒否条件）。
// 記載内容は実際のデータフローに基づく（③ REST API 設計 §3 の Prisma schema と
// app/backend/src/auth/session.ts の Cookie 実装が正）。B-06（アバター）・B-13（試合永続化）
// は不採用のため、アバター画像・試合履歴は一切保存されない

export default function PrivacyPage() {
	return (
		<article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 text-slate-200">
			<header className="flex flex-col gap-2">
				<h1 className="text-2xl font-semibold">Privacy Policy</h1>
				<p className="text-sm text-slate-500">最終更新: 2026-08-21</p>
			</header>

			<p className="text-sm leading-relaxed text-slate-300">
				ft_transcendence（以下「本サービス」）は 42 の教育課程 ft_transcendence の一環として開発・運用される
				非商用のオンライン対戦ゲームです。本ページは、本サービスがどのような個人情報を収集し、何のために
				利用し、どこにどのくらいの期間保存するかを説明します。
			</p>

			<section className="flex flex-col gap-2">
				<h2 className="text-lg font-semibold text-slate-100">収集する情報</h2>
				<p className="text-sm leading-relaxed text-slate-300">
					アカウント登録・ログイン時に、以下の情報のみを収集します。
				</p>
				<ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
					<li>メールアドレス</li>
					<li>パスワードのハッシュ値（argon2id によるハッシュ。生のパスワードは保存しません）</li>
					<li>表示名</li>
					<li>ログインセッションを維持するための Cookie（ランダムに生成されたセッション識別子）</li>
				</ul>
				<p className="text-sm leading-relaxed text-slate-300">
					アバター画像および対戦履歴は、現時点の本サービスでは機能自体が提供されていないため、
					<strong className="text-slate-100">一切収集・保存されません</strong>。
				</p>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-lg font-semibold text-slate-100">利用目的</h2>
				<p className="text-sm leading-relaxed text-slate-300">
					収集した情報は、以下の目的にのみ利用します。
				</p>
				<ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
					<li>本人確認・ログイン状態の維持（認証）</li>
					<li>対戦相手の組み合わせ（マッチメイキング）</li>
				</ul>
				<p className="text-sm leading-relaxed text-slate-300">
					広告配信・行動分析・マーケティングなど、上記以外の目的で情報を利用することはありません。
				</p>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-lg font-semibold text-slate-100">Cookie について</h2>
				<p className="text-sm leading-relaxed text-slate-300">
					本サービスはログインセッションを維持するためだけに Cookie を使用します。Cookie にはランダムに
					生成されたセッション識別子のみが含まれ、サーバー側にはその SHA-256 ハッシュ値だけを保存します。
					ユーザーの行動を追跡する目的（アクセス解析・広告トラッキング等）では使用しません。ログアウト、
					またはセッションの有効期限切れにより Cookie は無効になります。
				</p>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-lg font-semibold text-slate-100">保存場所と保存期間</h2>
				<p className="text-sm leading-relaxed text-slate-300">
					収集した情報は、本サービスを運営するサーバー上の SQLite データベースに自己ホスト形式で保存され、
					外部のクラウドサービスやデータベースには保存されません。保存期間はアカウントが存在する限りで、
					アカウントを削除しない限り情報は保持され続けます。
				</p>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-lg font-semibold text-slate-100">第三者への提供</h2>
				<p className="text-sm leading-relaxed text-slate-300">
					収集した情報を第三者に販売・提供・共有することはありません。
				</p>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-lg font-semibold text-slate-100">アカウントの削除について</h2>
				<p className="text-sm leading-relaxed text-slate-300">
					本サービスには、現時点でユーザー自身がアカウントを削除する機能はありません。アカウントの削除
					（登録情報の消去）を希望される場合は、本リポジトリの運営者（
					<a
						href="https://github.com/samatsum"
						className="text-sky-400 underline hover:text-sky-300"
						target="_blank"
						rel="noreferrer"
					>
						samatsum
					</a>
					）宛てに、
					<a
						href="https://github.com/samatsum/ft_Transcendence/issues"
						className="text-sky-400 underline hover:text-sky-300"
						target="_blank"
						rel="noreferrer"
					>
						本リポジトリの GitHub Issue
					</a>
					経由でご連絡ください。確認のうえ、登録されたメールアドレスに紐づく情報を手動で削除します。
				</p>
			</section>
		</article>
	);
}
