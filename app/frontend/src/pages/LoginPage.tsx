import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loginRequestSchema, selfSchema, type LoginRequest, type Self } from '@ft/shared';

import { ApiError } from '../api/apiError.js';
import { useApi } from '../api/useApi.js';
import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { FormField } from '../components/FormField.js';
import { Input } from '../components/Input.js';
import { useAuth } from '../contexts/AuthContext.js';

type FieldErrors = Partial<Record<keyof LoginRequest | 'form', string>>;

function loginFormError(err: ApiError): FieldErrors {
	if (err.code === 'unauthenticated') {
		return { form: 'メールアドレスまたはパスワードが違います' };
	}
	if (err.code === 'validation_failed' && err.details) {
		return {
			...(err.details.email ? { email: err.details.email } : {}),
			...(err.details.password ? { password: err.details.password } : {}),
		};
	}
	return { form: err.message || 'ログインに失敗しました' };
}

function loginDestination(state: unknown): string {
	if (
		typeof state === 'object' &&
		state !== null &&
		'from' in state &&
		typeof state.from === 'string' &&
		state.from.startsWith('/')
	) {
		return state.from;
	}
	return '/lobby';
}

export default function LoginPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const api = useApi();
	const { setUser } = useAuth();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [errors, setErrors] = useState<FieldErrors>({});
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (submitting) return;

		setErrors({});

		const parsed = loginRequestSchema.safeParse({
			email,
			password,
		});

		if (!parsed.success) {
			setErrors({
				email: parsed.error.issues.some((issue) => issue.path[0] === 'email')
					? 'メールアドレスの形式で入力してください'
					: undefined,
				password: parsed.error.issues.some((issue) => issue.path[0] === 'password')
					? 'パスワードは8文字以上で入力してください'
					: undefined,
			});
			return;
		}

		setSubmitting(true);
		try {
			const user = await api.post<Self>('/api/auth/login', parsed.data, {
				schema: selfSchema,
				toast: false,
			});

			setUser({ id: user.id, displayName: user.display_name });
			navigate(loginDestination(location.state), { replace: true });
		} catch (err) {
			if (err instanceof ApiError) {
				setErrors(loginFormError(err));
			} else {
				setErrors({ form: 'ログインに失敗しました' });
			}
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
			<h1 className="text-heading-lg">ログイン</h1>

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

					<FormField label="パスワード" error={errors.password} required>
						<Input
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							autoComplete="current-password"
							disabled={submitting}
						/>
					</FormField>

					<Button type="submit" fullWidth disabled={submitting}>
						{submitting ? 'ログイン中…' : 'ログイン'}
					</Button>

					<Button
						type="button"
						variant="secondary"
						fullWidth
						disabled={submitting}
						onClick={() => navigate('/signup')}
					>
						新規作成
					</Button>
				</form>
			</Card>
		</div>
	);
}
