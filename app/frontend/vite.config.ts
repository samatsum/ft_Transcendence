import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// I-01/B-08: 開発サーバの骨格。/api と /ws は backend へプロキシして、開発中も
// 本番（nginx が同一オリジンで REST/WS を振り分ける。0-全体アーキテクチャ設計 §3.1）と
// 同じ「同一オリジンで /api・/ws を叩く」形に揃える＝Cookie 認証（B-04）が開発でも素直に動く
export default defineConfig(({ mode }) => {
	// リポジトリルートの `.env` を読む。Vite の既定は「プロジェクト直下の .env、かつ
	// VITE_ 接頭辞のみ」なので、そのままだと `.env.example` が宣言している
	// BACKEND_PORT / FRONTEND_PORT が効かず、backend の待受ポートと食い違って
	// /api のプロキシが壊れる。第3引数の '' は「接頭辞なしも読む」の意味。
	// シェルの環境変数を後勝ちにして、CI や docker からの上書きを優先する
	//
	// **`NODE_ENV` の副作用を打ち消す。** `.env` に B-04 の開発用スタブ
	// （`NODE_ENV=development` / `ALLOW_DEV_AUTH=true`、backend の dev-auth 用）が
	// 書かれていると、Vite の `loadEnv` は戻り値を使わなくても呼んだ時点で
	// `process.env.VITE_USER_NODE_ENV` にそれを書き込む（vite/dist/node/chunks/node.js の
	// loadEnv 実装）。この変数は Vite 本体が resolveConfig の中で **もう一度**読み、
	// `vite build` であっても `process.env.NODE_ENV` を `development` に上書きしてしまう
	// ——結果、production 用に minify されない React（実測 354KB→568KB）が出力される。
	// 戻り値から NODE_ENV を除くだけでは防げない（副作用は loadEnv 呼び出し自体で起きる）ため、
	// 呼び出し直後に明示的にこの変数を潰す。
	//
	// **`delete` ではなく空文字列を代入する**（CodeRabbitの指摘・2026-08-26）。
	// Vite本体は resolveConfig の中でこの変数を読んだ後、`envDir`（既定はVite側の
	// プロジェクトroot＝`app/frontend`）に対してもう一度 loadEnv を呼ぶ。今は
	// `app/frontend/.env` が無いので実害は出ないが、将来そこに `.env` ができて
	// `NODE_ENV` を書いても、`delete` は変数を `undefined` に戻すだけなので
	// 2回目の loadEnv がまた上書きしてしまう。loadEnv 側の代入条件は
	// `process.env.VITE_USER_NODE_ENV === void 0` のときだけなので、`undefined`
	// ではない値（空文字列）にしておけば、呼び出し元が増えても上書きされない
	const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
	const loadedEnv = loadEnv(mode, repoRoot, '');
	process.env.VITE_USER_NODE_ENV = '';
	const env = { ...loadedEnv, ...process.env };

	function requirePort(raw: string | undefined, name: string, fallback: number): number {
		if (raw === undefined) return fallback;
		const n = Number(raw);
		if (!Number.isInteger(n) || n < 1 || n > 65535) {
			throw new Error(`${name}="${raw}" は不正なポート番号（1〜65535 の整数が必要）`);
		}
		return n;
	}

	const fePort = requirePort(env.FRONTEND_PORT, 'FRONTEND_PORT', 5173);
	const bePort = requirePort(env.BACKEND_PORT, 'BACKEND_PORT', 3000);

	return {
		plugins: [react(), tailwindcss()],
		// **`VITE_` 変数もリポジトリルートの `.env` から読む。**
		// 上の `loadEnv` は BACKEND_PORT / FRONTEND_PORT を解決するためだけのもので、
		// `import.meta.env` へは何も注入しない。`envDir` を指定しないと Vite 本体は
		// 既定の envDir（＝このファイルがある `app/frontend/`）しか見に行かず、
		// そこに `.env` は無いので `.env.example` が宣言している VITE_DEV_AUTOLOGIN が
		// **静かに undefined になる**（AuthContext の開発スタブが有効にならず、
		// 保護ルートが常に /login へリダイレクトする形で現れる）。
		// 露出するのは `VITE_` 接頭辞のものだけなので、同じファイルにある
		// SESSION_SECRET などがクライアントへ漏れることはない
		envDir: repoRoot,
		server: {
			host: '0.0.0.0',
			port: fePort,
			proxy: {
				'/api': {
					target: `http://localhost:${bePort}`,
					changeOrigin: true,
				},
				'/ws': {
					target: `ws://localhost:${bePort}`,
					ws: true,
					changeOrigin: true,
				},
			},
		},
	};
});
