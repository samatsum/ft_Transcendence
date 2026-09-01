import { Link } from 'react-router-dom';

import { Card } from '../components/Card.js';

// Issue #108 操作マニュアル。このコミットでは FPS のみ扱う（RSP は続けて足す）。
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

function KeyTable({ rows }: { rows: ReadonlyArray<readonly [string, string]> }) {
	return (
		<table className="w-full text-body">
			<tbody>
				{rows.map(([key, action]) => (
					<tr key={key} className="border-b border-border last:border-b-0">
						<th scope="row" className="w-40 py-2 pr-4 text-left align-top text-label">
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
		<div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8">
			<h1 className="text-heading-lg">操作マニュアル</h1>

			<Card className="flex flex-col gap-3">
				<h2 className="text-heading-sm">FPS モード</h2>
				<img
					src="/how-to/fps.png"
					alt="FPS モードのプレイ画面。中央にクロスヘア、左下に収集進捗、右下にミニマップが表示されている"
					className="w-full rounded-md border border-border"
				/>
				<p className="text-body text-fg-muted">
					収集アイテムをすべて集めると扉が開き、先にゴールへ到達した側が勝ちます。
					敵に触れると約 5 秒後に自分のスタート地点へ戻ります（敗北ではありません）。
					相手プレイヤーも撃てますが、HP が 0 になっても脱落はせず、復帰までの遅れになります。
				</p>
			</Card>

			<Card className="flex flex-col gap-3">
				<h2 className="text-heading-sm">共通の操作</h2>
				<KeyTable rows={COMMON_KEYS} />
			</Card>

			<Card className="flex flex-col gap-3">
				<h2 className="text-heading-sm">FPS モードだけの操作</h2>
				<KeyTable rows={FPS_KEYS} />
				<p className="text-caption text-fg-muted">
					RSP モードではこの 4 つは無効です。RSP の説明は準備中です。
				</p>
			</Card>

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
