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
import { authApi, type Self } from '@ft/shared';

import { isAbortError } from '../api/apiFetch.js';
import { plainRequester } from '../api/requester.js';

// ④ D-12「fetch ラッパ + Context + zod」の Auth Context。
// - 起動時に GET /api/auth/me を叩き、ログイン中なら user を保持（④ §1）
// - B-04 未実装のため 401/404/network error はすべて「未ログイン」扱いにする
//   （F-01 の推奨決定#3）
// - VITE_DEV_AUTOLOGIN=1 でネットワーク接続なしにダミー user を注入する
// - API 呼び出しは #163 の shared ヘルパー（`authApi`）経由。URL とレスポンススキーマの
//   対応は shared/src/api/auth.ts が持つ

export interface AuthUser {
	id: number;
	displayName: string;
}

// `/api/auth/me` の実レスポンス（selfSchema・③§2-A）は snake_case の display_name を
// 返すため、camelCase の AuthUser へ変換する。#163 以前はここに selfSchema の複製
// （authUserSchema）を置いていたが、shared の契約と二重管理だったので変換だけを残した。
// export しているのは AuthContext.test.ts から直接検査するため（#135回帰）
export function toAuthUser(self: Self): AuthUser {
	return { id: self.id, displayName: self.display_name };
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
		return toAuthUser(await authApi.me(plainRequester, { signal }));
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
		// #163 の shared ヘルパー経由。204 が返る前提なので schema なし
		try {
			await authApi.logout(plainRequester);
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
