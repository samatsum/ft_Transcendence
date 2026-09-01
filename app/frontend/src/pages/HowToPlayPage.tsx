import { Link } from 'react-router-dom';

import { Card } from '../components/Card.js';

// Issue #108 操作マニュアル。FPS と RSP を左右に並べた1枚もの。モード切替は持たない
// （この画面に入る時点では部屋のモードが決まっていないため、どちらも同時に見せる）。
// 戻り先は部屋画面(/lobby)。2026-09-01 の画面遷移図でゲームメニュー画面が廃止されたため、
// Issue 本文の「戻る→ゲームメニュー画面」には従っていない。
// キー割り当ての出典は README の Controls と docs/human/プレイヤー向け/プレイヤーガイド.html。
// ただし Esc だけは native の「終了」ではなく、ブラウザでは視点ロックの解除
// (app/frontend/src/game/useGameInput.ts)。文言は samatsum に未確認。

const COMMON_KEYS: ReadonlyArray<readonly [string, string]> = [
	['W / S', '前進 / 後退'],
	['A / D', '左右へ平行移動'],
	['← / →', '視点を左右に回転'],
	['I', 'ミニマップ・収集進捗の表示切替'],
	['O', 'クロスヘアの表示切替'],
	['L', '距離による陰影の切替'],
	['Esc', '操作の解除（視点ロックを外す）'],
];

const FPS_KEYS: ReadonlyArray<readonly [string, string]> = [
	['1', 'ピストルを装備'],
	['2', 'フラッシュライトを装備'],
	['3', '素手（移動が 1.5 倍速くなる）'],
	['Space', '射撃（ピストル装備時のみ・クールダウンあり）'],
];

const RSP_DISABLED_KEYS: ReadonlyArray<readonly [string, string]> = [
	['1 / 2 / 3', '無効（武器の持ち替えはできない）'],
	['Space', '無効（射撃はできない）'],
];

function KeyTable({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
	return (
		<table className="w-full text-body">
			<tbody>
				{rows.map(([key, action]) => (
					<tr key={key} className="border-b border-border last:border-b-0">
						<th scope="row" className="w-32 py-2 pr-4 text-left align-top text-label">
							{key}
						</th>
						<td className="py-2 text-fg-muted">{action}</td>
					</tr>
				))}
			</tbody>
		</table>
	);
}

export default function HowToPlayPage() {
	return (
		<div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
			<header className="flex flex-col gap-2">
				<h1 className="text-heading-lg">操作マニュアル</h1>
				<p className="text-body text-fg-muted">
					部屋のモードによって遊び方が変わります。FPS モードと RSP モードの両方を載せているので、
					これから入る部屋のモードに合う側を読んでください。
				</p>
			</header>

			<Card className="flex flex-col gap-3">
				<h2 className="text-heading-sm">共通の操作</h2>
				<KeyTable rows={COMMON_KEYS} />
				<p className="text-caption text-fg-muted">
					移動は WASD、視点の回転は左右の矢印だけです。上下の矢印・Q・E は割り当てがありません。
				</p>
			</Card>

			<div className="grid gap-6 md:grid-cols-2">
				<Card className="flex flex-col gap-3">
					<h2 className="text-heading-sm">FPS モード</h2>
					<img
						src="/how-to/fps.png"
						alt="FPS モードのプレイ画面。中央にクロスヘア、左下に収集進捗、右下にミニマップが表示されている"
						className="w-full rounded-md border border-border"
					/>
					<ul className="list-disc space-y-1 pl-5 text-body text-fg-muted">
						<li>収集アイテムをすべて集めると扉が開き、先にゴールへ到達した側が勝ちます。</li>
						<li>敵に触れると約 5 秒後に自分のスタート地点へ戻ります（敗北ではありません）。</li>
						<li>相手プレイヤーも撃てますが、HP が 0 になっても脱落はせず、復帰までの遅れになります。</li>
					</ul>
					<h3 className="text-label">このモードだけの操作</h3>
					<KeyTable rows={FPS_KEYS} />
				</Card>

				<Card className="flex flex-col gap-3">
					<h2 className="text-heading-sm">RSP モード（じゃんけん鬼ごっこ）</h2>
					<img
						src="/how-to/rsp.png"
						alt="RSP モードのプレイ画面。戦闘員の頭上にじゃんけんの手のスプライトが表示され、画面上部に赤チームと青チームのスコアが出ている"
						className="w-full rounded-md border border-border"
					/>
					<ul className="list-disc space-y-1 pl-5 text-body text-fg-muted">
						<li>赤チームと青チームに分かれ、相手チームの戦闘員に触れるとその場でじゃんけんの判定が起きます。</li>
						<li>勝った側のチームに 1 点入り、負けた側はすぐリスポーンします（あいこと味方どうしでは何も起きません）。</li>
						<li>自分の手は頭上に表示され、自陣のスポーンマスへ新しく踏み込むと別の手へランダムに変わります。</li>
						<li>既定では先に 10 点取ったチームの勝ちです（先取点は部屋の設定で変わります）。</li>
					</ul>
					<h3 className="text-label">このモードで使えない操作</h3>
					<KeyTable rows={RSP_DISABLED_KEYS} />
				</Card>
			</div>

			<div>
				<Link
					to="/lobby"
					className="inline-flex items-center justify-center gap-2 rounded-md bg-bg-hover px-4 py-2 text-label text-fg transition-colors hover:bg-border"
				>
					戻る
				</Link>
			</div>
		</div>
	);
}
