// B-04: ③ §2-A のうち、まず `POST /api/auth/login` だけを本実装する
// （signup/logout/me は後続）。
import type { FastifyInstance } from 'fastify';
import { loginRequestSchema, makeError, type Self } from '@ft/shared';

import type { PrismaClient } from '../generated/prisma/client.js';
import { DUMMY_PASSWORD_HASH, verifyPassword } from './password.js';
import {
	generateSessionToken,
	hashSessionToken,
	sessionExpiryFromNow,
	SESSION_COOKIE_NAME,
} from './session.js';

export interface AuthRoutesOptions {
	prisma: PrismaClient;
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

export function registerAuthRoutes(app: FastifyInstance, { prisma }: AuthRoutesOptions): void {
	app.post(
		'/api/auth/login',
		// ③§1-C: ブルートフォース対策で 5回/分/IP（既定の30/分を上書き）
		{ config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
		async (request, reply) => {
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

			reply.setCookie(SESSION_COOKIE_NAME, token, {
				httpOnly: true,
				secure: true,
				sameSite: 'lax',
				path: '/',
				maxAge: 7 * 24 * 60 * 60,
			});
			return toSelf(user);
		},
	);
}
