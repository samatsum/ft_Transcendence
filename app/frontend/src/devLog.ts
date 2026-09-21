// 開発時だけ受信データの検証失敗を残す。本番ではコンソールを汚さない
export function devLog(message: string, details?: unknown): void {
	if (!import.meta.env.DEV) return;
	// eslint-disable-next-line no-console -- 開発時だけの受信検証診断
	console.debug(message, details);
}
