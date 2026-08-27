// B-04: ③ §2-A の `/api/auth` エンドポイント一式（signup/login/logout/me）。
import type { FastifyReply, FastifyRequest, FastifyInstance } from 'fastify';
import { loginRequestSchema, signupRequestSchema, makeError, type Self } from '@ft/shared';

import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import type { ConnectionManager } from '../ws/connection.js';
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from './password.js';
import {
	authenticateRequest,
	generateSessionToken,
	hashSessionToken,
	isAllowedOrigin,
	sessionExpiryFromNow,
	SESSION_COOKIE_NAME,
	type AuthedUser,
} from './session.js';

export interface AuthRoutesOptions {
	prisma: PrismaClient;
	connectionManager: ConnectionManager;
}

function toSelf(user: {
	id: number;
	email: string;
	displayName: string;
	avatarPath: string | null;
	createdAt: Date;
}): Self {
	return {
		id: user.id,
		email: user.email,
		display_name: user.displayName,
		avatar_url: user.avatarPath,
		created_at: user.createdAt.toISOString(),
	};
}

/** ③ D-6: mutating メソッドの Origin 検証。失敗なら403エンベロープを送って `false` を返す */
function requireOrigin(request: FastifyRequest, reply: FastifyReply): boolean {
	if (isAllowedOrigin(request)) return true;
	reply.code(403).send(makeError('forbidden', 'この Origin からのリクエストは許可されていません'));
	return false;
}

/**
 * Cookie を検証し、失敗なら401エンベロープを送って `null` を返す。
 *
 * 認証に成功したら Cookie も張り直す。`authenticateRequest` はDB側の
 * `Session.expiresAt` をスライディング延長するが（③D-5）、Cookie自体の
 * `maxAge` は login/signup 時の7日固定のままだと、DBのセッションはまだ
 * 有効なのにブラウザ側のCookieだけ7日で消えてログアウトしてしまう
 * （CodeRabbitの指摘・2026-08-26）。`x-dev-user` の開発スタブには対応する
 * Cookie が無いので、Cookieが実際に来ているときだけ張り直す
 */
async function requireAuth(
	request: FastifyRequest,
	reply: FastifyReply,
): Promise<AuthedUser | null> {
	const user = await authenticateRequest(request);
	if (!user) {
		reply.code(401).send(makeError('unauthenticated', 'ログインが必要です'));
		return null;
	}
	const token = request.cookies[SESSION_COOKIE_NAME];
	if (token) setSessionCookie(reply, token);
	return user;
}

function setSessionCookie(reply: FastifyReply, token: string): void {
	reply.setCookie(SESSION_COOKIE_NAME, token, {
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		path: '/',
		maxAge: 7 * 24 * 60 * 60,
	});
}

/**
 * P2002(unique制約違反)がどのカラムで起きたかを見て、③§1-A のコードに変換する。
 *
 * better-sqlite3 driver adapter (Prisma 7) では違反カラムが `meta.target` ではなく
 * `meta.driverAdapterError.cause.constraint.fields` に入る（実機で確認、`meta.target`は
 * 常に undefined だった）。将来 adapter が変わっても拾えるよう両方見る。
 */
function isUniqueViolationOn(error: unknown, column: 'email' | 'displayName' | 'displayNameLower'): boolean {
	if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
		return false;
	}
	const meta = error.meta as
		| { target?: unknown; driverAdapterError?: { cause?: { constraint?: { fields?: unknown } } } }
		| undefined;
	const target = meta?.target;
	if (typeof target === 'string' && target.includes(column)) return true;
	if (Array.isArray(target) && target.includes(column)) return true;
	const adapterFields = meta?.driverAdapterError?.cause?.constraint?.fields;
	return Array.isArray(adapterFields) && adapterFields.includes(column);
}

export function registerAuthRoutes(
	app: FastifyInstance,
	{ prisma, connectionManager }: AuthRoutesOptions,
): void {
	app.post(
		'/api/auth/signup',
		// ③§1-C: ブルートフォース対策で 5回/分/IP（既定の30/分を上書き）
		{ config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
		async (request, reply) => {
			if (!requireOrigin(request, reply)) return;

			const { email, password, display_name } = signupRequestSchema.parse(request.body);
			const passwordHash = await hashPassword(password);

			let user;
			try {
				user = await prisma.user.create({
					data: {
						email,
						passwordHash,
						displayName: display_name,
						displayNameLower: display_name.toLowerCase(),
					},
				});
			} catch (error) {
				if (isUniqueViolationOn(error, 'email')) {
					reply.code(409);
					return makeError('email_taken', 'このメールアドレスは既に使われています');
				}
				if (
					isUniqueViolationOn(error, 'displayName') ||
					isUniqueViolationOn(error, 'displayNameLower')
				) {
					reply.code(409);
					return makeError('name_taken', 'この表示名は既に使われています');
				}
				throw error;
			}

			const token = generateSessionToken();
			await prisma.session.create({
				data: {
					userId: user.id,
					tokenHash: hashSessionToken(token),
					expiresAt: sessionExpiryFromNow(),
				},
			});

			setSessionCookie(reply, token);
			reply.code(201);
			return toSelf(user);
		},
	);

	app.post(
		'/api/auth/login',
		// ③§1-C: ブルートフォース対策で 5回/分/IP（既定の30/分を上書き）
		{ config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
		async (request, reply) => {
			if (!requireOrigin(request, reply)) return;

			const { email, password } = loginRequestSchema.parse(request.body);

			const user = await prisma.user.findUnique({ where: { email } });
			// メール不存在でも argon2.verify を1回走らせ、応答時間の差から
			// 「そのメールが登録済みか」を推測されないようにする（③§2-A の列挙攻撃対策）
			const passwordOk = await verifyPassword(user?.passwordHash ?? DUMMY_PASSWORD_HASH, password);

			if (!user || !passwordOk) {
				reply.code(401);
				return makeError('unauthenticated', 'メールアドレスまたはパスワードが違います');
			}

			const token = generateSessionToken();
			await prisma.session.create({
				data: {
					userId: user.id,
					tokenHash: hashSessionToken(token),
					expiresAt: sessionExpiryFromNow(),
				},
			});

			setSessionCookie(reply, token);
			return toSelf(user);
		},
	);

	app.post('/api/auth/logout', async (request, reply) => {
		if (!requireOrigin(request, reply)) return;

		const authed = await requireAuth(request, reply);
		if (!authed) return;

		// `authed.sessionId` を直接 delete のキーにしない。`x-dev-user` の開発スタブは
		// 対応する Session 行を持たずに sessionId だけ返すため、`delete`（対象行が無いと
		// P2025 で例外）だと落ちる上、たまたま実在の別ユーザーの Session.id と数値が
		// 一致すると誤って削除してしまう（CodeRabbitの指摘・2026-08-26）。実Cookieの
		// tokenHash を条件にした deleteMany なら、対象が無くても例外にならず、
		// 開発スタブ(Cookie無し)なら何も消さない
		const token = request.cookies[SESSION_COOKIE_NAME];
		if (token) {
			await prisma.session.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
		}
		reply.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
		connectionManager.closeSessionConnections(authed.sessionId);
		reply.code(204);
	});

	app.get('/api/auth/me', async (request, reply) => {
		const authed = await requireAuth(request, reply);
		if (!authed) return;

		const user = await prisma.user.findUnique({ where: { id: authed.userId } });
		if (!user) {
			reply.code(401);
			return makeError('unauthenticated', 'ログインが必要です');
		}
		return toSelf(user);
	});
}
