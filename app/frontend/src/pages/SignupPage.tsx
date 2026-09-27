import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { selfSchema, signupRequestSchema, type Self, type SignupRequest } from '@ft/shared';
import type { ZodIssue } from 'zod';

import { useApi } from '../api/useApi.js';
import { ApiError } from '../api/apiError.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { FormField } from '../components/FormField.js';
import { Input } from '../components/Input.js';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import {
	credentialMessage,
	detailsFieldErrors,
	FALLBACK_VALIDATION_MESSAGE,
	issueFieldErrors,
	type FormErrors,
} from './formErrors.js';

type FieldName = keyof SignupRequest;
type FieldErrors = FormErrors<FieldName>;

function isFieldName(value: unknown): value is FieldName {
	return value === 'email' || value === 'display_name' || value === 'password';
}

/** display_name だけがこの画面固有。email / password の文言は LoginPage と共通 */
function validationMessage(issue: ZodIssue): string {
	if (issue.path[0] === 'display_name') {
		if (issue.code === 'too_small') return '表示名は3文字以上で入力してください';
		if (issue.code === 'too_big') return '表示名は20文字以内で入力してください';
		return '表示名は英数字・_・- のみ使えます';
	}
	return credentialMessage(issue) ?? FALLBACK_VALIDATION_MESSAGE;
}

function apiFieldErrors(err: ApiError): FieldErrors {
	if (err.code === 'email_taken') {
		return { email: 'このメールアドレスは既に登録されています' };
	}
	if (err.code === 'name_taken') {
		return { display_name: 'この表示名は既に使われています' };
	}
	if (err.code === 'validation_failed' && err.details) {
		const errors = detailsFieldErrors(err.details, isFieldName);
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
			setErrors(issueFieldErrors(parsed.error.issues, isFieldName, validationMessage));
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
				<form className="flex flex-col gap-4" noValidate onSubmit={handleSubmit}>
					{errors.form && (
						<Alert kind="error">{errors.form}</Alert>
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
