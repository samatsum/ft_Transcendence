import { Link } from 'react-router-dom';

import { Card } from '../components/Card.js';

// F-05 の担当（ロビー一式 + useLobbySocket）。ここは stub。
// GV-06 の GameView 用に /game/dev-room への暫定リンクを残す。
// 注意: このリンクは現状ブラウザからは繋がらない。通常起動のサーバーはルームを作らず(4002)、
// ブラウザの WebSocket は開発用認証の x-dev-user ヘッダを送れない(4000)。B-04 と F-05 待ち。
//
// CodeRabbit 指摘: Link と Button は両方 interactive なので入れ子にすると不正 HTML。
// Link に Button 相当のクラスを直付けする（Button の VARIANT_CLASS と揃える）

export default function LobbyPage() {
	return (
		<div className="mx-auto flex max-w-4xl flex-col gap-4 px-4 py-8">
			<h1 className="text-xl font-semibold">ロビー</h1>
			<Card>
				<p className="text-sm text-slate-400">
					このページは F-05 で実装します（Quick Match / カスタムルーム / ルームビュー）。
				</p>
			</Card>
			<div className="flex gap-2">
				<Link
					to="/game/dev-room"
					className="inline-flex items-center justify-center gap-2 rounded-md bg-slate-700 px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-slate-600"
				>
					/game/dev-room を開く (GV-06 用・B-04まで未接続)
				</Link>
			</div>
		</div>
	);
}
