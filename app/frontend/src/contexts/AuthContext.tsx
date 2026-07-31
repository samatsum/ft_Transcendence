import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	type ReactNode,
} from 'react';

// ④ D-12「fetch ラッパ + Context + zod」の Auth Context。
// - 起動時に GET /api/auth/me を叩き、ログイン中なら user を保持（④ §1）
// - W-04 未実装のため 401/404/network error はすべて「未ログイン」扱いにする
//   （F-01 の推奨決定#3）
// - VITE_DEV_AUTOLOGIN=1 でネットワーク接続なしにダミー user を注入する
//   （backend が立たない状態でも Layout / Guards の挙動を目視できる）
// - user shape は W-04 の /api/auth/me レスポンス確定後、shared 側の zod へ寄せる想定。
//   現時点では最小のフィールドだけを持つ

export interface AuthUser {
	id: number;
	displayName: string;
}

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
	status: AuthStatus;
	user: AuthUser | null;
	/** login/signup 成功時に呼ぶ（F-03）。fetch は F-03 の担当、ここは state 更新だけ */
	setUser: (user: AuthUser | null) => void;
	/** ログアウト API を呼び、成功時に user を null に戻す（③ §2-A の logout） */
	logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

async function fetchMe(signal: AbortSignal): Promise<AuthUser | null> {
	try {
		const res = await fetch('/api/auth/me', { signal, credentials: 'same-origin' });
		if (!res.ok) return null;
		const data = (await res.json()) as unknown;
		// W-04 完成までの暫定 shape 確認（zod は W-04 のスキーマ登場時に置き換え）
		if (
			typeof data === 'object' && data !== null &&
			'id' in data && typeof (data as { id: unknown }).id === 'number' &&
			'displayName' in data && typeof (data as { displayName: unknown }).displayName === 'string'
		) {
			const d = data as { id: number; displayName: string };
			return { id: d.id, displayName: d.displayName };
		}
		return null;
	} catch {
		// AbortError / network error はすべて null（未ログイン扱い）
		return null;
	}
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<AuthStatus>('loading');
	const [user, setUserState] = useState<AuthUser | null>(null);

	useEffect(() => {
		// 開発スタブ: VITE_DEV_AUTOLOGIN=1 で /me を叩かずログイン済みにする。
		// CodeRabbit 指摘: import.meta.env.DEV も同時に要求することで、production
		// ビルドで誤って env を立ててもスタブが有効化されない二重ガード
		if (import.meta.env.DEV && import.meta.env.VITE_DEV_AUTOLOGIN === '1') {
			setUserState({ id: 0, displayName: 'dev-user' });
			setStatus('authenticated');
			return;
		}
		const controller = new AbortController();
		fetchMe(controller.signal).then((u) => {
			if (controller.signal.aborted) return;
			setUserState(u);
			setStatus(u ? 'authenticated' : 'unauthenticated');
		});
		return () => controller.abort();
	}, []);

	const setUser = useCallback((u: AuthUser | null) => {
		setUserState(u);
		setStatus(u ? 'authenticated' : 'unauthenticated');
	}, []);

	const logout = useCallback(async () => {
		// W-04 未実装なので失敗は握って握って state だけ落とす。
		// 本来は失敗時にトースト表示（F-02 の fetch ラッパへ寄せる）
		try {
			await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
		} catch {
			// swallow
		}
		setUserState(null);
		setStatus('unauthenticated');
	}, []);

	const value = useMemo<AuthContextValue>(
		() => ({ status, user, setUser, logout }),
		[status, user, setUser, logout],
	);

	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
	const v = useContext(AuthContext);
	if (!v) throw new Error('useAuth must be used within <AuthProvider>');
	return v;
}
