import js from '@eslint/js';
import { defineConfig, globalIgnores } from 'eslint/config';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// JavaScript, TypeScriptの共通基本ルール
const typescriptRules = [
	js.configs.recommended,
	tseslint.configs.recommended,
];

// 色の直書き禁止（#223）。色は index.css のデザイントークン経由で指定する。
// 文字列リテラルとテンプレート文字列の中の Tailwind クラスを正規表現で見る。
// 検査するのは色だけで、文字サイズ（text-sm など）は対象外（#164 の TL 決定）
const paletteColors =
	'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|black|white';
const colorUtilities =
	'bg|text|border|ring|outline|fill|stroke|from|via|to|divide|placeholder|shadow|caret|decoration';
// 例: bg-<色名>-<段> / hover:text-<色名>-<段> / bg-black/<不透明度>（前後が英数字やハイフンなら別の語なので除く）
// ここに実在のクラス名をそのまま書かないこと。Tailwind はこのファイルも走査するので、使われない CSS が生成される
const rawPaletteClass = `(?<![\\w-])(${colorUtilities})-(${paletteColors})(-\\d+)?(?![\\w-])`;
// 例: bg-[#<16進>] / text-[rgb(…)] / border-[var(--color-<色名>-<段>)]
const rawArbitraryColor = `(?<![\\w-])(${colorUtilities})-\\[(#|rgba?\\(|hsla?\\(|oklch\\(|var\\(--color-(${paletteColors})\\b)`;
const rawColorMessage =
	'色を直書きしないこと。index.css のトークン（bg-surface / text-fg-muted など）を使う。トークンに寄せない例外は src/components/rawColors.ts に理由と一緒に書く（#223）';
const noRawColors = [rawPaletteClass, rawArbitraryColor].flatMap((pattern) => [
	{ selector: `Literal[value=/${pattern}/]`, message: rawColorMessage },
	{ selector: `TemplateElement[value.raw=/${pattern}/]`, message: rawColorMessage },
]);

export default defineConfig([
	// Viteが生成する成果物を除外
	globalIgnores(['dist']),

	{
		// src/ 下のts, tsxを検査
		files: ['src/**/*.{ts,tsx}'],
		extends: typescriptRules,
		plugins: {
			// recommended設定を使わず、pluginを明示登録（React Compiler未導入のため）
			'react-hooks': reactHooks,
		},
		languageOptions: {
			// 許可するバージョンをtsconfigに合わせる
			ecmaVersion: 2022,
			// window / document / fetchなどのブラウザAPIの未定義扱いを防ぐ
			globals: globals.browser,
		},
		rules: {
			// React の hooks 使用に関するルール
			'react-hooks/rules-of-hooks': 'error',
			'react-hooks/exhaustive-deps': 'error',

			// console の使用をエラー
			'no-console': 'error',

			// 色の直書きをエラー（#223）
			'no-restricted-syntax': ['error', ...noRawColors],
		},
	},

	{
		// トークンに寄せない色の置き場。例外はこのファイルだけ（#223）
		files: ['src/components/rawColors.ts'],
		rules: {
			'no-restricted-syntax': 'off',
		},
	},

	{
		// Vite設定ファイルを検査
		files: ['vite.config.ts'],
		extends: typescriptRules,
		languageOptions: {
			ecmaVersion: 2022,
			// processなど、Node.jsのグローバル変数を認識させる
			globals: globals.node,
		},
	},
]);
