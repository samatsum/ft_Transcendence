import { z } from 'zod';

// ② §2-A 共通メッセージ規約。ロビー WS / ゲーム WS の両方が従う。
// 全メッセージは JSON テキストフレーム1つ = 1メッセージ。

/**
 * `{ t: <種別>, d: { ...ペイロード } }`。
 *
 * まずこの形で受けて `t` を見てから、種別ごとのスキーマで `d` を検証する
 * （2段構え）。こうすると**未知の `t` を「壊れたメッセージ」と区別できる**。
 * ② §2-A は未知の `t` を `error` 応答にとどめ、切断はしないと定めている
 * （開発中の前方互換のため）。
 */
export const envelopeSchema = z.object({
	t: z.string(),
	d: z.unknown().optional(),
});

export type Envelope = z.infer<typeof envelopeSchema>;

/** プロトコルバージョン。`lobby_hello` / `welcome` の `v` に載せる（② §2-A） */
export const WS_PROTOCOL_VERSION = 1;

/** ② §2-A: クライアント→サーバの1メッセージ上限。超過は close 4001 */
export const MAX_CLIENT_MESSAGE_BYTES = 4096;

/** ② §2-A: スキーマ違反は `error` 応答にとどめるが、連続でこの回数に達したら close 4001 */
export const MAX_CONSECUTIVE_SCHEMA_VIOLATIONS = 10;

/** ② §2-B: WS クローズコード規約 */
export const WS_CLOSE = {
	/** 正常終了（画面遷移・試合終了後の退室） */
	normal: 1000,
	/** 未認証 / セッション失効。アップグレード時 */
	unauthenticated: 4000,
	/** プロトコル違反（スキーマ違反の累積・サイズ超過） */
	protocolViolation: 4001,
	/** ルームが存在しない / 既に閉鎖。ゲーム WS join 時 */
	roomNotFound: 4002,
	/** 参加権なし（満席・participant でない・定員外 slot） */
	notAllowed: 4003,
	/** 新しい接続に置換された */
	replaced: 4004,
	/** レート制限超過 */
	rateLimited: 4005,
} as const;

export type WsCloseCode = (typeof WS_CLOSE)[keyof typeof WS_CLOSE];

/** ② §2-D: レート制限（接続単位）。超過時の扱いは節ごとに違う */
export const WS_RATE_LIMIT = {
	/** ゲーム WS `input`: 30Hz 送信 + ジッタ余裕。超過分は**黙って破棄**（切断しない） */
	gameInputPerSecond: 40,
	/** ロビー WS 全種: 超過で `error(rate_limited)`、連続超過で close 4005 */
	lobbyPerSecond: 5,
} as const;
