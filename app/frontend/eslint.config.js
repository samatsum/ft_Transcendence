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
