import {
	envelopeSchema,
	gameEventSchema,
	gameServerMessageSchema,
	playerStatusMessageSchema,
	snapshotMessageSchema,
	welcomeMessageSchema,
	type GameEvent,
	type PlayerStatusMessage,
	type SnapshotPayload,
	type WelcomeMessage,
} from '@ft/shared';

import { devLog } from '../devLog.js';

export interface GameMessageHandlers {
	onWelcome: (payload: WelcomeMessage['d']) => void;
	onSnapshot: (payload: SnapshotPayload) => void;
	onEvent: (event: GameEvent['d']) => void;
	onPlayerStatus: (payload: PlayerStatusMessage['d']) => void;
}

/** ゲーム受信フレームを検証し、種別ごとの正常なペイロードだけを呼び出し元へ渡す */
export function handleGameServerMessage(data: string, handlers: GameMessageHandlers): void {
	let raw: unknown;
	try {
		raw = JSON.parse(data);
	} catch (error) {
		devLog('ゲーム WS: JSON の解析に失敗したため受信メッセージを破棄しました', {
			raw: data,
			error,
		});
		return;
	}
	const env = envelopeSchema.safeParse(raw);
	if (!env.success) {
		devLog('ゲーム WS: envelope 検証に失敗したため受信メッセージを破棄しました', {
			raw,
			issues: env.error.issues,
		});
		return;
	}
	switch (env.data.t) {
		case 'welcome': {
			const message = welcomeMessageSchema.safeParse(raw);
			if (message.success) {
				handlers.onWelcome(message.data.d);
			} else {
				devLog('ゲーム WS: welcome 検証に失敗したため受信メッセージを破棄しました', {
					raw,
					issues: message.error.issues,
				});
			}
			return;
		}
		case 'snapshot': {
			const message = snapshotMessageSchema.safeParse(raw);
			if (message.success) {
				handlers.onSnapshot(message.data.d);
			} else {
				devLog('ゲーム WS: snapshot 検証に失敗したため受信メッセージを破棄しました', {
					raw,
					issues: message.error.issues,
				});
			}
			return;
		}
		case 'event': {
			const message = gameEventSchema.safeParse(raw);
			if (message.success) {
				handlers.onEvent(message.data.d);
			} else {
				devLog('ゲーム WS: event 検証に失敗したため受信メッセージを破棄しました', {
					raw,
					issues: message.error.issues,
				});
			}
			return;
		}
		case 'player_status': {
			const message = playerStatusMessageSchema.safeParse(raw);
			if (message.success) {
				handlers.onPlayerStatus(message.data.d);
			} else {
				devLog('ゲーム WS: player_status 検証に失敗したため受信メッセージを破棄しました', {
					raw,
					issues: message.error.issues,
				});
			}
			return;
		}
		default: {
			const message = gameServerMessageSchema.safeParse(raw);
			if (!message.success) {
				devLog('ゲーム WS: メッセージ検証に失敗したため受信メッセージを破棄しました', {
					raw,
					issues: message.error.issues,
				});
			}
		}
	}
}
