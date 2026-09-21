import { lobbyServerMessageSchema, type LobbyServerMessage } from '@ft/shared';

import { devLog } from '../devLog.js';

/** ロビー受信フレームを検証し、正常なメッセージだけを呼び出し元へ渡す */
export function handleLobbyServerMessage(
	data: string,
	onMessage: (message: LobbyServerMessage) => void,
): void {
	let raw: unknown;
	try {
		raw = JSON.parse(data);
	} catch (error) {
		devLog('ロビー WS: JSON の解析に失敗したため受信メッセージを破棄しました', {
			raw: data,
			error,
		});
		return;
	}
	const parsed = lobbyServerMessageSchema.safeParse(raw);
	if (!parsed.success) {
		devLog('ロビー WS: スキーマ検証に失敗したため受信メッセージを破棄しました', {
			raw,
			issues: parsed.error.issues,
		});
		return;
	}
	onMessage(parsed.data);
}
