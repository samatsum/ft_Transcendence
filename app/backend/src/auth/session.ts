// B-04 / B-05: REST と WS が共有する認証の入口（Issue #11 でシグネチャを合意）。
//
// `authenticateRequest`/`isAllowedOrigin` は呼び出し側のシグネチャを変えずに
// 中身だけ本実装に置き換えている（B-08〜B-11 が auth の完成を待たずに
// 書き進められるよう、Issue #11 で先に決めた契約を守った）。
//
// REST と WS で1本にしてある理由（Issue #11）:
//   - `@fastify/websocket` の WS ハンドラが受け取る `req` は REST と同じ `FastifyRequest`
//   - ③ D-4/D-5 のとおり Cookie は REST も WS も同一なので、検証の中身に差が無い
//   - 違うのは**失敗時の振る舞いだけ**（REST=401 エンベロープ / WS=close 4000）。
//     なのでここは `null` を返すにとどめ、どうするかは呼び出し側が決める
import { createHash, randomBytes } from 'node:crypto';

import type { FastifyRequest } from 'fastify';

import type { PrismaClient } from '../generated/prisma/client.js';

/** ③ D-5 の Cookie 名（Issue #11 で決定） */
export const SESSION_COOKIE_NAME = 'ft_session';

/** ③ D-5: TTL 7日（アクセスごとのスライド延長は authenticateRequest の本実装で行う） */
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** 生トークン（Cookie に載せる方）。SHA-256 ハッシュだけを DB に保存する（③§3） */
export function generateSessionToken(): string {
	return randomBytes(32).toString('base64url');
}

export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export function sessionExpiryFromNow(): Date {
	return new Date(Date.now() + SESSION_TTL_MS);
}

export interface AuthedUser {
	userId: number;
	/** B-12 の再接続で「同じセッションか」を見たくなった場合のため */
	sessionId: number;
}

/**
 * B-04 の本実装が入るまで `x-dev-user` を使うための明示的な開発用 opt-in。
 *
 * `NODE_ENV !== 'production'` だけでは、NODE_ENV の設定漏れや staging でもスタブ認証が
 * 開くため不十分。development と専用フラグの両方を明示した場合だけ許可する。
 */
function isDevAuthEnabled(): boolean {
	return process.env.NODE_ENV === 'development' && process.env.ALLOW_DEV_AUTH === 'true';
}

/**
 * B-04 本実装用の PrismaClient 注入口。
 *
 * `authenticateRequest` は Issue #11 合意のシグネチャ（`req` のみ）を保つため、
 * 呼び出し側（`ws.ts` など）を変えずに済むよう、DB は index.ts から一度だけ
 * ここへ渡してもらう（`connection.ts` の `setSessionValidator` と同じパターン）。
 */
let prismaClient: PrismaClient | null = null;

export function configureAuthPrisma(prisma: PrismaClient): void {
	prismaClient = prisma;
}

/**
 * Cookie を検証して「このリクエスト/接続が誰か」を返す。無効なら `null`。
 *
 * 1. `SESSION_COOKIE_NAME` の Cookie を取り出す（無ければ null）
 * 2. SHA-256 でハッシュし `Session.tokenHash` を引く（③ §3。生トークンは保存しない）
 * 3. `expiresAt` を過ぎていれば null
 * 4. ③ D-5 のスライディング延長で `expiresAt` を更新し、`User.lastSeenAt` も更新する
 *    （③§3 `User.lastSeenAt` のコメント「認証付きリクエストで更新する」）
 *
 * @returns 認証できたユーザー、または `null`
 */
export async function authenticateRequest(req: FastifyRequest): Promise<AuthedUser | null> {
	// このスタブは「本実装では消してよい」と書かれていたが、あえて残した。
	// `lobby-check.ts` / `ws-check.ts`（`npm run check:lobby` 等）が DB 無しで
	// 複数ユーザーを装うのに `x-dev-user` ヘッダへ依存しているため、消すとこれらが壊れる。
	// 本番では isDevAuthEnabled() が false なので、この分岐自体を通らない。
	if (isDevAuthEnabled()) {
		const devUser = Number(req.headers['x-dev-user']);
		if (Number.isInteger(devUser) && devUser > 0) {
			return { userId: devUser, sessionId: devUser };
		}
	}

	const token = req.cookies[SESSION_COOKIE_NAME];
	if (!token || !prismaClient) return null;

	const session = await prismaClient.session.findUnique({
		where: { tokenHash: hashSessionToken(token) },
	});
	if (!session || session.expiresAt.getTime() <= Date.now()) return null;

	await prismaClient.session.update({
		where: { id: session.id },
		data: { expiresAt: sessionExpiryFromNow() },
	});
	await prismaClient.user.update({
		where: { id: session.userId },
		data: { lastSeenAt: new Date() },
	});

	return { userId: session.userId, sessionId: session.id };
}

/**
 * ② §1 / ③ D-6 の Origin 検査。自ホストと一致しない接続・リクエストを拒否する
 * （CSRF-over-WS 対策 / CSRF対策）。WS の Upgrade 時と、REST の mutating メソッド
 * （`routes.ts` の signup/login/logout）の両方からこの1つの判定を使う。
 *
 * 中身自体は B-04 着手前から完成していた（実装済みなのに、呼び出し側がどこにも
 * 無かっただけ）。今回変えたのは呼び出し側（`routes.ts`）だけで、ここは無改修。
 */
export function isAllowedOrigin(req: FastifyRequest): boolean {
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
export const AUTH_IS_STUB = false;
