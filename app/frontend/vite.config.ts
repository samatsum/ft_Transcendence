import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// W-01: 開発サーバの骨格。/api は backend へプロキシして、開発中も
// 本番（nginx が同一オリジンで REST/WS を振り分ける。0-全体アーキテクチャ設計 §3.1）と
// 同じ「同一オリジンで /api を叩く」形に揃える＝Cookie 認証（W-04）が開発でも素直に動く
export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		host: '0.0.0.0',
		port: Number(process.env.FRONTEND_PORT ?? 5173),
		proxy: {
			'/api': {
				target: `http://localhost:${process.env.BACKEND_PORT ?? 3000}`,
				changeOrigin: true,
			},
		},
	},
});
