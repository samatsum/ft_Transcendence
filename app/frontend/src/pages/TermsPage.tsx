// F-04: ④ §3.5 の章立てに沿った実文面。プレースホルダー禁止（拒否条件）

export default function TermsPage() {
	return (
		<article className="mx-auto flex max-w-3xl flex-col gap-8 px-4 py-12 text-slate-200">
			<header className="flex flex-col gap-2">
				<h1 className="text-2xl font-semibold">Terms of Service</h1>
				<p className="text-sm text-slate-500">最終更新: 2026-08-21</p>
			</header>

			<section className="flex flex-col gap-2">
				<h2 className="text-lg font-semibold text-slate-100">サービスの説明</h2>
				<p className="text-sm leading-relaxed text-slate-300">
					ft_transcendence（以下「本サービス」）は、ブラウザ上で動作するオンライン対戦ゲームです。
					プレイヤー同士がリアルタイムで対戦する競技性のあるゲームプレイを提供します。本サービスは
					42 の教育課程の一環として制作された教育目的のプロジェクトであり、商用サービスではありません。
				</p>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-lg font-semibold text-slate-100">禁止事項</h2>
				<p className="text-sm leading-relaxed text-slate-300">
					本サービスの利用にあたり、以下の行為を禁止します。
				</p>
				<ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-300">
					<li>
						不正アクセス（他人のアカウントへの不正なログイン、認証機構の回避、脆弱性の悪用など）
					</li>
					<li>チート行為（ゲームクライアント/通信の改ざん、自動操作ツールの使用など公正な対戦を妨げる行為）</li>
					<li>他者を不快にさせる表示名の使用（誹謗中傷・なりすまし・差別的な表現を含む表示名など）</li>
				</ul>
				<p className="text-sm leading-relaxed text-slate-300">
					禁止事項に該当する行為が確認された場合、運営者の判断によりアカウントの利用を制限することが
					あります。
				</p>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-lg font-semibold text-slate-100">保証の否認</h2>
				<p className="text-sm leading-relaxed text-slate-300">
					本サービスは、現在の状態のまま提供されます。
					動作の継続性・可用性・無欠陥性についていかなる保証も行いません。
				</p>
			</section>

			<section className="flex flex-col gap-2">
				<h2 className="text-lg font-semibold text-slate-100">教育プロジェクトについて</h2>
				<p className="text-sm leading-relaxed text-slate-300">
					本サービスは 42 の教育課程 ft_transcendence の課題として開発されたものであり、学習・評価を
					目的としています。継続的な商用運用は想定していません。
				</p>
			</section>
		</article>
	);
}
