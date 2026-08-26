// `docs/ai/rest-api.md` が正本。ここはそれを複製せず、実装が実際に使っている
// `shared/src/api/` の zod スキーマ「そのもの」から `/api/docs` 用の spec を組み立てる
// （zod v4 組み込みの `z.toJSONSchema`。追加パッケージ不要）。
// zod スキーマを変えれば docs も自動的に追従するので、二重管理による食い違いが起きない。
//
// ルートは Fastify の `schema:` オプションを使わず、ハンドラ内で手動 `.parse()` している
// （既存の B-02 エラーハンドラの流儀）。そのため `@fastify/swagger` の dynamic モード
// （ルートの schema を自動収集する方式）では何も拾えない。ここでは static モードで、
// spec をこのファイルだけで完結させて組み立てる
import { z } from 'zod';
import {
	errorEnvelopeSchema,
	healthSchema,
	listMapsQuerySchema,
	listMapsResponseSchema,
	loginRequestSchema,
	selfSchema,
	signupRequestSchema,
} from '@ft/shared';

function toSchema(schema: z.ZodType): Record<string, unknown> {
	return z.toJSONSchema(schema, { target: 'openapi-3.0' }) as Record<string, unknown>;
}

function jsonBody(schema: z.ZodType) {
	return { content: { 'application/json': { schema: toSchema(schema) } } };
}

function errorResponse(description: string) {
	return { description, ...jsonBody(errorEnvelopeSchema) };
}

export function buildOpenApiDocument() {
	return {
		openapi: '3.0.3',
		info: {
			title: 'ft_Transcendence API',
			version: '1.0.0',
			description:
				'仕様の正本は docs/ai/rest-api.md。ここは shared/src/api/ の zod スキーマから' +
				'生成した参照用ドキュメントで、実装と自動的に一致する',
		},
		paths: {
			'/api/health': {
				get: {
					summary: '疎通確認',
					responses: {
						'200': { description: 'OK', ...jsonBody(healthSchema) },
					},
				},
			},
			'/api/maps': {
				get: {
					summary: 'マップ一覧（③§2-E）',
					parameters: [
						{
							name: 'mode',
							in: 'query',
							required: false,
							schema: toSchema(listMapsQuerySchema.shape.mode),
						},
					],
					responses: {
						'200': { description: 'OK', ...jsonBody(listMapsResponseSchema) },
						'400': errorResponse('validation_failed'),
						'429': errorResponse('rate_limited'),
					},
				},
			},
			'/api/auth/signup': {
				post: {
					summary: '新規登録（③§2-A）。成功時は Set-Cookie でセッションも張られる',
					requestBody: { required: true, ...jsonBody(signupRequestSchema) },
					responses: {
						'201': { description: 'Created', ...jsonBody(selfSchema) },
						'400': errorResponse('validation_failed'),
						'403': errorResponse('forbidden（Origin不一致。③D-6）'),
						'409': errorResponse('email_taken / name_taken'),
						'429': errorResponse('rate_limited（5回/分/IP）'),
					},
				},
			},
			'/api/auth/login': {
				post: {
					summary: 'ログイン（③§2-A）',
					requestBody: { required: true, ...jsonBody(loginRequestSchema) },
					responses: {
						'200': { description: 'OK', ...jsonBody(selfSchema) },
						'400': errorResponse('validation_failed'),
						'401': errorResponse('unauthenticated（メール不存在と誤パスワードは区別しない）'),
						'403': errorResponse('forbidden（Origin不一致。③D-6）'),
						'429': errorResponse('rate_limited（5回/分/IP）'),
					},
				},
			},
			'/api/auth/logout': {
				post: {
					summary: 'ログアウト（③§2-A）。開いているWS接続も閉じる',
					responses: {
						'204': { description: 'No Content' },
						'401': errorResponse('unauthenticated'),
						'403': errorResponse('forbidden（Origin不一致。③D-6）'),
					},
				},
			},
			'/api/auth/me': {
				get: {
					summary: 'ログイン中の自分を取得（③§2-A、SPA起動時のセッション確認用）',
					responses: {
						'200': { description: 'OK', ...jsonBody(selfSchema) },
						'401': errorResponse('unauthenticated'),
					},
				},
			},
		},
	};
}
