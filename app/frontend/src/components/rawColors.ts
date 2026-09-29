// デザイントークンに寄せない色の一覧（#167 で判断、#223 でここへ集約）。
// 画面・部品は Tailwind のパレット名（slate-700 など）を直書きせず index.css のトークンを使う。
// ESLint がこれを検査していて、例外として直書きを許すのはこのファイルだけ（eslint.config.js）。
// **例外を足すときは、ここに理由と一緒に書く。** 画面側に直書きすると lint で落ちる

// 3D の上や背後の画面に敷く半透明のスクリム。可読性のための機能であって面の色ではない。
// surface 系のトークンは不透明なので、使うと下の映像が透けなくなる
export const SCRIM_60 = 'bg-black/60';
export const SCRIM_70 = 'bg-black/70';
export const SCRIM_80 = 'bg-black/80';

// 警告・エラーを伝えるスクリム。warning / danger のトークンは 500 の明度しか無く、
// この用途には明るすぎる（下の映像が見えなくなる／白文字が沈む）
export const SCRIM_WARNING = 'bg-amber-900/90';
export const SCRIM_DANGER_80 = 'bg-rose-900/80';
export const SCRIM_DANGER_90 = 'bg-rose-900/90';

// Canvas の余白（レターボックス）。面の色ではない
export const LETTERBOX = 'bg-black';

// チーム色。色そのものがルール上の識別子で、danger / accent とは意味が違う。
// rose-400 を danger-bright に読み替えると「赤チーム」と「エラー」が同じトークンになり、
// 片方を変えたときにもう片方が巻き添えになる。デザインシステムは bonus #10 として
// 完成宣言済み（architecture.md §4.2）なので、チーム色をトークンへ足す判断も避けている。
// text は暗い背景上の文字、fill は得点フラッシュ時の塗り
export const TEAM_RED = { text: 'text-rose-400', fill: 'bg-rose-600' } as const;
export const TEAM_BLUE = { text: 'text-sky-400', fill: 'bg-sky-600' } as const;

// 対戦者の状態ピル。3つで1組の対比表で、パレットには「背景 700 / 文字 100」の段が無い
// （success / warning は 500 のみ）。1つだけトークン化すると3色の明度が揃わなくなるため、組ごと据え置く
export const SEAT_STATE_PILL = {
	connected: 'bg-emerald-700 text-emerald-100',
	grace: 'bg-amber-700 text-amber-100',
	ai: 'bg-slate-600 text-slate-200',
} as const;
