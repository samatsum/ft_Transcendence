import { useAuth } from '../contexts/AuthContext.js';
import { Button } from './Button.js';

// #264: 起動時のセッション確認がサーバに届かなかったときの表示。
//
// **ここで /login へ送ってはいけない。** ログインしていないと分かったわけではなく、
// 訊けなかっただけなので、送ってしまうと「ログアウトされた」ように見える。

export function AuthUnavailable() {
	const { retryBootstrap } = useAuth();

	return (
		<div className="flex min-h-[50vh] flex-col items-center justify-center gap-4 p-6 text-center">
			<p className="text-body text-fg">サーバーに接続できませんでした。</p>
			<p className="text-caption text-fg-muted">
				ログイン状態は保たれています。通信が戻ってから再試行してください。
			</p>
			<Button onClick={retryBootstrap}>再試行</Button>
		</div>
	);
}
