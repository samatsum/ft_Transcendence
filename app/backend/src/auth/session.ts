// W-04 / W-05 で torinoue が実装する認証の共通入口（Issue #11 でシグネチャを合意）。
//
// **いまは samatsum が置いた暫定実装です。** W-08〜W-11 を auth の完成を待たずに
// 書き進めるための足場で、torinoue は **このファイルの中身を書き換えるだけ**でよく、
// 呼び出し側（`ws.ts` など）は1行も変わりません。
//
// REST と WS で1本にしてある理由（Issue #11）:
//   - `@fastify/websocket` の WS ハンドラが受け取る `req` は REST と同じ `FastifyRequest`
//   - ③ D-4/D-5 のとおり Cookie は REST も WS も同一なので、検証の中身に差が無い
//   - 違うのは**失敗時の振る舞いだけ**（REST=401 エンベロープ / WS=close 4000）。
//     なのでここは `null` を返すにとどめ、どうするかは呼び出し側が決める
import type { FastifyRequest } from 'fastify';

/** ③ D-5 の Cookie 名（Issue #11 で決定） */
export const SESSION_COOKIE_NAME = 'ft_session';

export interface AuthedUser {
	userId: number;
	/** W-12 の再接続で「同じセッションか」を見たくなった場合のため */
	sessionId: number;
}

/**
 * W-04 の本実装が入るまで `x-dev-user` を使うための明示的な開発用 opt-in。
 *
 * `NODE_ENV !== 'production'` だけでは、NODE_ENV の設定漏れで本番にもスタブ認証が
 * 開くため不十分。専用フラグが true で、かつ production でない場合だけ許可する。
 */
function isDevAuthEnabled(): boolean {
	return process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_AUTH === 'true';
}

/**
 * Cookie を検証して「このリクエスト/接続が誰か」を返す。無効なら `null`。
 *
 * **本実装（W-04/W-05）でやること**:
 *   1. `SESSION_COOKIE_NAME` の Cookie を取り出す（無ければ null）
 *   2. SHA-256 でハッシュし `Session.tokenHash` を引く（③ §3。生トークンは保存しない）
 *   3. `expiresAt` を過ぎていれば null
 *   4. ③ D-5 のスライディング延長で `expiresAt` を更新
 *
 * @returns 認証できたユーザー、または `null`
 */
export async function authenticateRequest(req: FastifyRequest): Promise<AuthedUser | null> {
	// TODO(W-04): 上記1〜4を実装する。torinoue がこの関数の中身を置き換える。
	//
	// それまでの繋ぎとして `x-dev-user` ヘッダで userId を指定できるようにしてある。
	// **W-11 の複数クライアント検証に必要**（スタブが常に同じ userId を返すと
	// 2人目が「同一ユーザーの多重接続」扱いで弾かれてしまう）。
	// 本実装では Cookie だけを見るので、この分岐ごと消えてよい。
	if (!isDevAuthEnabled()) return null;
	const devUser = Number(req.headers['x-dev-user']);
	if (!Number.isInteger(devUser) || devUser <= 0) return null;
	return { userId: devUser, sessionId: devUser };
}

/**
 * ② §1 の Origin 検査。自ホストと一致しない接続を拒否する（CSRF-over-WS 対策）。
 * REST の変更系にも同じ判定を使う（W-05「Origin 検証の共通化」）。
 */
export function isAllowedOrigin(req: FastifyRequest): boolean {
	// TODO(W-05): W-04 の Cookie 認証と合わせて共通ミドルウェアへ統合する。
	const origin = req.headers.origin;
	if (typeof origin !== 'string') return false;

	const allowedOrigin = process.env.ALLOWED_ORIGIN;
	if (allowedOrigin) return origin === allowedOrigin;
	if (!isDevAuthEnabled()) return false;

	// ALLOWED_ORIGIN 未設定時の開発用 fallback は loopback origin だけに限定する。
	try {
		const url = new URL(origin);
		return (
			(url.protocol === 'http:' || url.protocol === 'https:') &&
			(url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '[::1]')
		);
	} catch {
		return false;
	}
}

/** 上の2つが暫定実装のままか。起動ログで警告を出すために使う */
export const AUTH_IS_STUB = true;
