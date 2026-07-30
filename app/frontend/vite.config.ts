import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// W-01/W-08: 開発サーバの骨格。/api と /ws は backend へプロキシして、開発中も
// 本番（nginx が同一オリジンで REST/WS を振り分ける。0-全体アーキテクチャ設計 §3.1）と
// 同じ「同一オリジンで /api・/ws を叩く」形に揃える＝Cookie 認証（W-04）が開発でも素直に動く
export default defineConfig(({ mode }) => {
	// リポジトリルートの `.env` を読む。Vite の既定は「プロジェクト直下の .env、かつ
	// VITE_ 接頭辞のみ」なので、そのままだと `.env.example` が宣言している
	// BACKEND_PORT / FRONTEND_PORT が効かず、backend の待受ポートと食い違って
	// /api のプロキシが壊れる。第3引数の '' は「接頭辞なしも読む」の意味。
	// シェルの環境変数を後勝ちにして、CI や docker からの上書きを優先する
	const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
	const env = { ...loadEnv(mode, repoRoot, ''), ...process.env };

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
