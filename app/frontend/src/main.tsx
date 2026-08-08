import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import App from './App.js';
import { ErrorBoundary } from './components/ErrorBoundary.js';
import { AuthProvider } from './contexts/AuthContext.js';
import { ToastProvider } from './contexts/ToastContext.js';
import './index.css';

// F-01 で組み替え。外側→内側の順:
//   StrictMode
//     └── ErrorBoundary（描画例外の受け皿。④ §2 の受入）
//           └── BrowserRouter（GV-06 で先行導入）
//                 └── AuthProvider（起動時 /api/auth/me、④ §1 のガードの元）
//                       └── ToastProvider（fetch ラッパの F-02 が push する先）
//                             └── App（④ §1 の Routes 表）

const root = document.getElementById('root');
if (!root) {
	throw new Error('#root not found');
}

createRoot(root).render(
	<StrictMode>
		<ErrorBoundary>
			<BrowserRouter>
				<AuthProvider>
					<ToastProvider>
						<App />
					</ToastProvider>
				</AuthProvider>
			</BrowserRouter>
		</ErrorBoundary>
	</StrictMode>,
);
