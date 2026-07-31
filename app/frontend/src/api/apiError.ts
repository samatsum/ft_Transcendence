import type { ErrorCode } from '@ft/shared';

// F-02 の唯一のエラー型。3系統を1つに集約する(推奨決定#3):
//   - envelope の code(shared/error.ts の ErrorCode 空間)
//   - `network_error`: fetch 自体が失敗(サーバダウン / DNS / etc)
//   - `invalid_response`: レスポンスが非 JSON / envelope でない / schema 不一致
// これで呼び出し側は `err.code` で分岐でき、Toast も統一メッセージで出せる

export type ApiErrorCode = ErrorCode | 'network_error' | 'invalid_response';

export interface ApiErrorInit {
	status?: number;
	details?: Record<string, string>;
}

export class ApiError extends Error {
	override readonly name = 'ApiError';
	readonly code: ApiErrorCode;
	readonly status?: number;
	readonly details?: Record<string, string>;

	constructor(code: ApiErrorCode, message: string, init?: ApiErrorInit) {
		super(message);
		this.code = code;
		if (init?.status !== undefined) this.status = init.status;
		if (init?.details) this.details = init.details;
	}
}
