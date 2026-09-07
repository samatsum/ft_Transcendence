import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { selfSchema, signupRequestSchema, type Self, type SignupRequest } from '@ft/shared';
import type { ZodIssue } from 'zod';

import { useApi } from '../api/useApi.js';
import { ApiError } from '../api/apiError.js';
import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { FormField } from '../components/FormField.js';
import { Input } from '../components/Input.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';

type FieldName = keyof SignupRequest;
type FieldErrors = Partial<Record<FieldName | 'form', string>>;

function isFieldName(value: unknown): value is FieldName {
	return value === 'email' || value === 'display_name' || value === 'password';
}

function validationMessage(issue: ZodIssue): string {
	const field = issue.path[0];

	if (field === 'email') {
		return 'メールアドレスの形式で入力してください';
	}
	if (field === 'display_name') {
		if (issue.code === 'too_small') return '表示名は3文字以上で入力してください';
		if (issue.code === 'too_big') return '表示名は20文字以内で入力してください';
		return '表示名は英数字・_・- のみ使えます';
	}
	if (field === 'password') {
		if (issue.code === 'too_small') return 'パスワードは8文字以上で入力してください';
		if (issue.code === 'too_big') return 'パスワードは128文字以内で入力してください';
	}
	return '入力内容を確認してください';
}

function zodFieldErrors(issues: ZodIssue[]): FieldErrors {
	const errors: FieldErrors = {};

	for (const issue of issues) {
		const field = issue.path[0];
		if (isFieldName(field) && !errors[field]) {
			errors[field] = validationMessage(issue);
		}
	}

	return errors;
}

function apiFieldErrors(err: ApiError): FieldErrors {
	if (err.code === 'email_taken') {
		return { email: 'このメールアドレスは既に登録されています' };
	}
	if (err.code === 'name_taken') {
		return { display_name: 'この表示名は既に使われています' };
	}
	if (err.code === 'validation_failed' && err.details) {
		const errors: FieldErrors = {};
		for (const [field, message] of Object.entries(err.details)) {
			if (isFieldName(field)) errors[field] = message;
		}
		return Object.keys(errors).length > 0
			? errors
			: { form: '入力内容にエラーがあります' };
	}
	return { form: err.message || 'アカウント作成に失敗しました' };
}

export default function SignupPage() {
	const navigate = useNavigate();
	const api = useApi();
	const { setUser } = useAuth();
	const { push } = useToast();

	const [email, setEmail] = useState('');
	const [displayName, setDisplayName] = useState('');
	const [password, setPassword] = useState('');
	const [errors, setErrors] = useState<FieldErrors>({});
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (submitting) return;

		setErrors({});

		const parsed = signupRequestSchema.safeParse({
			email,
			display_name: displayName,
			password,
		});

		if (!parsed.success) {
			setErrors(zodFieldErrors(parsed.error.issues));
			return;
		}

		setSubmitting(true);
		try {
			const user = await api.post<Self>('/api/auth/signup', parsed.data, {
				schema: selfSchema,
				toast: false,
			});

			setUser({ id: user.id, displayName: user.display_name });
			push({ kind: 'success', message: 'アカウントを作成しました' });
			navigate('/lobby', { replace: true });
		} catch (err) {
			if (err instanceof ApiError) {
				setErrors(apiFieldErrors(err));
			} else {
				setErrors({ form: 'アカウント作成に失敗しました' });
			}
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
			<h1 className="text-heading-lg">アカウント作成</h1>

			<Card>
				<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
					{errors.form && (
						<p className="rounded-md border border-rose-500 bg-rose-950/40 px-3 py-2 text-body text-rose-200">
							{errors.form}
						</p>
					)}

					<FormField label="メールアドレス" error={errors.email} required>
						<Input
							type="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							autoComplete="email"
							disabled={submitting}
						/>
					</FormField>

					<FormField
						label="表示名"
						error={errors.display_name}
						hint="3〜20文字。英数字・_・- が使えます"
						required
					>
						<Input
							value={displayName}
							onChange={(event) => setDisplayName(event.target.value)}
							autoComplete="username"
							disabled={submitting}
						/>
					</FormField>

					<FormField label="パスワード" error={errors.password} required>
						<Input
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							autoComplete="new-password"
							disabled={submitting}
						/>
					</FormField>

					<Button type="submit" fullWidth disabled={submitting}>
						{submitting ? '作成中…' : '新規作成'}
					</Button>

					<Button
						type="button"
						variant="secondary"
						fullWidth
						disabled={submitting}
						onClick={() => navigate('/login')}
					>
						戻る
					</Button>
				</form>
			</Card>
		</div>
	);
}
