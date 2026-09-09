import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { loginRequestSchema, selfSchema, type Self } from '@ft/shared';

import { ApiError } from '../api/apiError.js';
import { apiFetch } from '../api/apiFetch.js';
import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { FormField } from '../components/FormField.js';
import { Input } from '../components/Input.js';
import { useAuth } from '../contexts/AuthContext.js';

// F-03。ログインは useApi ではなく apiFetch（React 非依存の下位層）を直接使う。
// useApi は 401 を「セッション切れ」とみなして /login へ飛ばすが、この画面では
// 401 こそがパスワード誤りの正常系で、出したいのは画面内のエラー文言だから。

interface FieldErrors {
	email?: string;
	password?: string;
	form?: string;
}

/** サーバのエラー code を、この画面の文言へ落とす */
function loginErrorMessage(err: ApiError): FieldErrors {
	// メール不存在とパスワード誤りをサーバが区別しない（列挙攻撃対策）ので、画面でも区別しない
	if (err.code === 'unauthenticated') {
		return { form: 'メールアドレスまたはパスワードが違います' };
	}
	if (err.code === 'rate_limited') {
		return { form: '試行が多すぎます。1分ほど待ってからもう一度お試しください' };
	}
	return { form: err.message || 'ログインに失敗しました' };
}

export default function LoginPage() {
	const navigate = useNavigate();
	const location = useLocation();
	const { setUser } = useAuth();
	const [email, setEmail] = useState('');
	const [password, setPassword] = useState('');
	const [errors, setErrors] = useState<FieldErrors>({});
	const [submitting, setSubmitting] = useState(false);

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		if (submitting) return;
		setErrors({});

		// 送る前に shared のスキーマで確かめる。往復を1回省けるうえ、
		// サーバと同じ定義なので画面とサーバで判定がずれない
		const parsed = loginRequestSchema.safeParse({ email, password });
		if (!parsed.success) {
			const next: FieldErrors = {};
			for (const issue of parsed.error.issues) {
				if (issue.path[0] === 'email' && !next.email) {
					next.email = 'メールアドレスの形式で入力してください';
				}
				if (issue.path[0] === 'password' && !next.password) {
					next.password = 'パスワードは8文字以上で入力してください';
				}
			}
			setErrors(next);
			return;
		}

		setSubmitting(true);
		try {
			const user = await apiFetch<Self>(
				'/api/auth/login',
				{ method: 'POST', body: parsed.data },
				selfSchema,
			);
			// セッション Cookie はサーバが httpOnly で付ける。画面側は本人情報だけ持つ
			setUser({ id: user.id, displayName: user.display_name });
			// 保護ルートから弾かれて来たなら元の場所へ戻す（RequireAuth が state.from に積む）
			const from = (location.state as { from?: string } | null)?.from;
			navigate(from ?? '/lobby', { replace: true });
		} catch (err) {
			setErrors(
				err instanceof ApiError
					? loginErrorMessage(err)
					: { form: 'ログインに失敗しました' },
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
			<h1 className="text-heading-lg">ログイン</h1>

			<Card>
				<form className="flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
					<FormField label="メールアドレス" error={errors.email} required>
						<Input
							type="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							autoComplete="email"
						/>
					</FormField>

					<FormField label="パスワード" error={errors.password} required>
						<Input
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							autoComplete="current-password"
						/>
					</FormField>

					{errors.form && (
						<p className="text-body text-rose-400" role="alert">
							{errors.form}
						</p>
					)}

					<Button type="submit" fullWidth disabled={submitting}>
						{submitting ? 'ログイン中…' : 'ログイン'}
					</Button>

					<Button
						type="button"
						variant="secondary"
						fullWidth
						onClick={() => navigate('/signup')}
					>
						新規作成
					</Button>
				</form>
			</Card>
		</div>
	);
}
