import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button } from '../components/Button.js';
import { Card } from '../components/Card.js';
import { FormField } from '../components/FormField.js';
import { Input } from '../components/Input.js';
import { useAuth } from '../contexts/AuthContext.js';

export default function LoginPage() {
	const navigate = useNavigate();
	const { setUser } = useAuth();
	const [username, setUsername] = useState('');
	const [password, setPassword] = useState('');
	const [error, setError] = useState<string | null>(null);

	function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
		event.preventDefault();

		if (!username || !password) {
			setError('ユーザー名とパスワードを入力してください');
			return;
		}

		// TODO(F-03): 実際の POST /api/auth/login に差し替える
		setUser({ id: 0, displayName: username });

		navigate('/lobby');
	}

	return (
		<div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-12">
			<h1 className="text-heading-lg">ログイン</h1>

			<Card>
				<form className="flex flex-col gap-4" onSubmit={handleSubmit}>
					<FormField label="ユーザー名" required>
						<Input
							value={username}
							onChange={(event) => setUsername(event.target.value)}
							autoComplete="username"
						/>
					</FormField>

					<FormField label="パスワード" error={error} required>
						<Input
							type="password"
							value={password}
							onChange={(event) => setPassword(event.target.value)}
							autoComplete="current-password"
						/>
					</FormField>

					<Button type="submit" fullWidth>
						ログイン
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
