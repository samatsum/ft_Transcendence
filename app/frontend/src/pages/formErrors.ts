import type { ZodIssue } from 'zod';

// #206。LoginPage と SignupPage で同型だったエラー組み立ての共通部分。
// 画面固有のもの（display_name の文言、email_taken / unauthenticated などの code 分岐、
// 何も当てはまらないときの既定文言）は各画面に残す。
// vitest は environment: 'node' で DOM が無いため、ここは純関数だけにする。

export type FormErrors<F extends string> = Partial<Record<F | 'form', string>>;

/** email / password の zod issue を文言へ落とす。どちらでもなければ undefined */
export function credentialMessage(issue: ZodIssue): string | undefined {
	const field = issue.path[0];

	if (field === 'email') {
		return 'メールアドレスの形式で入力してください';
	}
	if (field === 'password') {
		if (issue.code === 'too_small') return 'パスワードは8文字以上で入力してください';
		if (issue.code === 'too_big') return 'パスワードは128文字以内で入力してください';
	}
	return undefined;
}

/** どの画面の文言にも当てはまらない issue の既定文言 */
export const FALLBACK_VALIDATION_MESSAGE = '入力内容を確認してください';

/** 送信前検証。フィールドごとに最初の1件だけ出す */
export function issueFieldErrors<F extends string>(
	issues: ZodIssue[],
	isField: (value: unknown) => value is F,
	message: (issue: ZodIssue) => string,
): FormErrors<F> {
	const errors: FormErrors<F> = {};

	for (const issue of issues) {
		const field = issue.path[0];
		if (isField(field) && !errors[field]) {
			errors[field] = message(issue);
		}
	}

	return errors;
}

/**
 * `validation_failed` の details を、画面が知っているフィールドへ配る。
 * 知らないフィールドは捨てる。1つも残らなければ空オブジェクトを返し、
 * form に何を出すかは画面が決める
 */
export function detailsFieldErrors<F extends string>(
	details: Record<string, string> | undefined,
	isField: (value: unknown) => value is F,
): FormErrors<F> {
	const errors: FormErrors<F> = {};

	for (const [field, message] of Object.entries(details ?? {})) {
		if (isField(field)) errors[field] = message;
	}

	return errors;
}
