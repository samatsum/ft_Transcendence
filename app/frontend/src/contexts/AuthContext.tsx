import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';
import { z } from 'zod';

import { apiFetch, isAbortError } from '../api/apiFetch.js';

// ④ D-12「fetch ラッパ + Context + zod」の Auth Context。
// - 起動時に GET /api/auth/me を叩き、ログイン中なら user を保持（④ §1）
// - B-04 未実装のため 401/404/network error はすべて「未ログイン」扱いにする
//   （F-01 の推奨決定#3）
// - VITE_DEV_AUTOLOGIN=1 でネットワーク接続なしにダミー user を注入する
// - user shape は B-04 の /api/auth/me レスポンス確定後、shared 側の zod へ寄せる想定。
//   現時点では最小のフィールドだけを持つ（暫定 schema を api 呼び出しへ渡す）

export interface AuthUser {
	id: number;
	displayName: string;
}

// B-04 完成時に shared/api/ 側の zod へ置き換える暫定スキーマ
const authUserSchema = z.object({
	id: z.number(),
	displayName: z.string(),
});

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
		return await apiFetch<AuthUser>('/api/auth/me', { signal }, authUserSchema);
	} catch (err) {
		// F-02 の apiFetch は AbortError をそのまま再スロー、
		// その他は ApiError（unauthenticated / network_error / invalid_response 等）に統一。
		// AuthContext の初期 fetch では B-04 未実装時のフォールバックとして
		// 「Abort 以外は全部未ログイン扱い」で丸める
		if (isAbortError(err)) throw err;
		return null;
	}
}

export function AuthProvider({ children }: { children: ReactNode }) {
	const [status, setStatus] = useState<AuthStatus>('loading');
	const [user, setUserState] = useState<AuthUser | null>(null);
	// CodeRabbit 指摘: 起動時 bootstrap fetch が飛んでいる間に login/logout が走ると、
	// 遅れて到着した bootstrap 応答が最新 state を上書きしうる。世代カウンタで
	// bootstrap 応答の「現行性」を判定し、setUser/logout 時は世代を進めて無効化する
	const bootstrapGenRef = useRef<number>(0);
	const bootstrapControllerRef = useRef<AbortController | null>(null);

	useEffect(() => {
		// 開発スタブ: VITE_DEV_AUTOLOGIN=1 で /me を叩かずログイン済みにする。
		// import.meta.env.DEV も同時に要求することで、production ビルドで誤って env を
		// 立ててもスタブが有効化されない二重ガード
		if (import.meta.env.DEV && import.meta.env.VITE_DEV_AUTOLOGIN === '1') {
			setUserState({ id: 0, displayName: 'dev-user' });
			setStatus('authenticated');
			return;
		}
		const myGen = ++bootstrapGenRef.current;
		const controller = new AbortController();
		bootstrapControllerRef.current = controller;
		fetchMe(controller.signal)
			.then((u) => {
				// setUser/logout が世代を進めていたら、この応答は無効(遅れて到着)
				if (myGen !== bootstrapGenRef.current) return;
				if (controller.signal.aborted) return;
				setUserState(u);
				setStatus(u ? 'authenticated' : 'unauthenticated');
			})
			.catch(() => {
				// AbortError（cleanup or 明示 abort）は無視
			});
		return () => {
			controller.abort();
			if (bootstrapControllerRef.current === controller) {
				bootstrapControllerRef.current = null;
			}
		};
	}, []);

	// setUser/logout は共通で bootstrap を無効化する必要があるため helper 化
	const invalidateBootstrap = useCallback(() => {
		bootstrapGenRef.current++;
		bootstrapControllerRef.current?.abort();
		bootstrapControllerRef.current = null;
	}, []);

	const setUser = useCallback(
		(u: AuthUser | null) => {
			invalidateBootstrap();
			setUserState(u);
			setStatus(u ? 'authenticated' : 'unauthenticated');
		},
		[invalidateBootstrap],
	);

	const logout = useCallback(async () => {
		invalidateBootstrap();
		// B-04 未実装なので失敗は握って state だけ落とす。
		// F-02 の apiFetch 経由(credentials・error 統一)。204 が返る前提なので schema なし
		try {
			await apiFetch('/api/auth/logout', { method: 'POST' });
		} catch {
			// swallow（AuthContext の logout は「見た目 UI 状態を落とす」ことが主目的で、
			// 失敗しても user を null に落とすのが安全）
		}
		setUserState(null);
		setStatus('unauthenticated');
	}, [invalidateBootstrap]);

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
