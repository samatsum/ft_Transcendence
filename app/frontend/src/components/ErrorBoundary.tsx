import { Component, type ErrorInfo, type ReactNode } from 'react';

// ④ §2「ErrorBoundary: 描画例外時に再読込導線を出す（白画面と未処理例外を防ぐ）」。
// F-01 の推奨決定#2: App 全体を包む class ErrorBoundary 一箇所。
// UI は「もう一度読み込む」（location.reload）と「ホームへ」の2択。
// エラー詳細は dev ビルドのみ表示（import.meta.env.DEV）
//
// 注意: React ErrorBoundary は event handler / async / SSR の例外を捕捉しない。
// それらは try/catch と Toast で処理する（F-02 の fetch ラッパの責務）

interface Props {
	children: ReactNode;
}

interface State {
	error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
	override state: State = { error: null };

	static getDerivedStateFromError(error: Error): State {
		return { error };
	}

	override componentDidCatch(error: Error, info: ErrorInfo): void {
		// dev のみログ（本番はコンソールゼロ運用）。監視 sink は将来（保4）
		if (import.meta.env.DEV) {
			// eslint-disable-next-line no-console
			console.error('[ErrorBoundary]', error, info.componentStack);
		}
	}

	private handleReload = (): void => {
		window.location.reload();
	};

	private handleHome = (): void => {
		// SPA 内では router から navigate したいが、ErrorBoundary は Route の外側にも
		// 置かれうるので location 直書きで確実に飛ばす
		window.location.href = '/';
	};

	override render(): ReactNode {
		if (!this.state.error) return this.props.children;
		return (
			<main
				role="alert"
				className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-8 text-slate-100"
			>
				<h1 className="text-heading-md">画面の描画で問題が起きました</h1>
				<p className="max-w-md text-center text-body text-slate-400">
					もう一度読み込むか、ホームへ戻ってください。
				</p>
				{import.meta.env.DEV && (
					<pre className="max-w-xl overflow-x-auto rounded border border-slate-700 bg-slate-900 p-3 text-caption text-rose-300">
						{this.state.error.message}
					</pre>
				)}
				<div className="flex gap-3">
					<button
						type="button"
						onClick={this.handleReload}
						className="rounded-md bg-sky-500 px-4 py-2 text-label text-white hover:bg-sky-400"
					>
						もう一度読み込む
					</button>
					<button
						type="button"
						onClick={this.handleHome}
						className="rounded-md border border-slate-600 px-4 py-2 text-label text-slate-200 hover:bg-slate-800"
					>
						ホームへ
					</button>
				</div>
			</main>
		);
	}
}
