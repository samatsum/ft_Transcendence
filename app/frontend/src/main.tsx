import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.js';
import './index.css';

// StrictMode は F-01 の受入条件（④§6-1 のコンソールゼロ運用の土台）。
// BrowserRouter は F-06 で先行導入（/game/:roomId を届ける）。ErrorBoundary は F-01 で追加する
const root = document.getElementById('root');
if (!root) {
	throw new Error('#root not found');
}

createRoot(root).render(
	<StrictMode>
		<BrowserRouter>
			<App />
		</BrowserRouter>
	</StrictMode>,
);
