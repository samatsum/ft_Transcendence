import { useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { authApi, loginRequestSchema } from '@ft/shared';

import { ApiError } from '../api/apiError.js';
import { useApi } from '../api/useApi.js';
import { Alert } from '../components/Alert.js';
import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { FormField } from '../components/FormField.js';
import { Input } from '../components/Input.js';
import { useAuth } from '../contexts/AuthContext.js';
import { loginDestination } from '../auth/loginDestination.js';
import { loginApiError, zodFieldErrors, type FieldErrors } from './loginForm.js';

// F-03(#172/#162)。#182 と #186 の統合版。
//
// **401 は `redirectOn401: false` で自分で受ける（#201 / #202）。**
// useApi の既定は 401 を「セッション切れ」とみなして setUser(null) + /login へ navigate する。
// ところがこの画面では 401 こそパスワード誤りの正常系で、しかもその navigate は
// state.from を**現在地で上書き**する。既定のままだと
//   /lobby で弾かれる → /login（from='/lobby'）→ 1度打ち間違える → from='/login' に化ける
//   → 正しく入れ直して成功 → /login へ戻され、ログイン済みなのに画面が変わらない
// という形で壊れる（#201 の再現手順そのもの）。
// エラーは画面内に出すので toast も切る。Toast / 401 以外の共通処理は useApi のまま使える。

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

		// 送る前に shared のスキーマで確かめる。往復を1回省けるうえ、
		// サーバと同じ定義なので画面とサーバで判定がずれない
		const parsed = loginRequestSchema.safeParse({ email, password });
		if (!parsed.success) {
			setErrors(zodFieldErrors(parsed.error.issues));
			return;
		}

		setSubmitting(true);
		try {
			// URL・メソッド・req/res スキーマの対応は #163 のヘルパー側に閉じている
			const user = await authApi.login(api, parsed.data, {
				toast: false,
				redirectOn401: false,
			});

			// セッション Cookie はサーバが httpOnly で付ける。画面側は本人情報だけ持つ
			setUser({ id: user.id, displayName: user.display_name });
			navigate(loginDestination(location.state), { replace: true });
		} catch (err) {
			setErrors(
				err instanceof ApiError ? loginApiError(err) : { form: 'ログインに失敗しました' },
			);
		} finally {
			setSubmitting(false);
		}
	}

	return (
		<div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
			<h1 className="text-heading-lg">ログイン</h1>

			<Card>
				{/* noValidate: 付けないとブラウザ標準の検証が先に出て、自前の文言が表示されない */}
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
