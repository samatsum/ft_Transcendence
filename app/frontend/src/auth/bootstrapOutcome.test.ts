import { describe, expect, it } from 'vitest';

import { ApiError } from '../api/apiError.js';
import { bootstrapOutcomeFromError } from './bootstrapOutcome.js';

describe('bootstrapOutcomeFromError', () => {
	it('サーバが unauthenticated を返したときだけ未ログイン扱いにする', () => {
		const err = new ApiError('unauthenticated', 'ログインが必要です', { status: 401 });
		expect(bootstrapOutcomeFromError(err)).toBe('unauthenticated');
	});

	it('fetch 自体の失敗はログイン状態を変えない（#264 の本体）', () => {
		const err = new ApiError('network_error', '通信に失敗しました');
		expect(bootstrapOutcomeFromError(err)).toBe('unavailable');
	});

	it('502 の HTML など envelope でない応答もログイン状態を変えない', () => {
		const err = new ApiError('invalid_response', 'JSON ではない', { status: 502 });
		expect(bootstrapOutcomeFromError(err)).toBe('unavailable');
	});

	it('サーバ側エラーはログイン状態について何も言っていない', () => {
		const err = new ApiError('internal_error', 'サーバエラー', { status: 500 });
		expect(bootstrapOutcomeFromError(err)).toBe('unavailable');
	});

	it('ApiError ではない throw も unavailable に倒す', () => {
		expect(bootstrapOutcomeFromError(new TypeError('boom'))).toBe('unavailable');
		expect(bootstrapOutcomeFromError('文字列が投げられた')).toBe('unavailable');
		expect(bootstrapOutcomeFromError(undefined)).toBe('unavailable');
	});
});
