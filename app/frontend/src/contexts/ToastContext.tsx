import {
	createContext,
	useCallback,
	useContext,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from 'react';

import { ToastViewport } from '../components/Toast.js';

// ④ §2「Toast: エラー・通知の共通表示枠」。
// F-01 では push/dismiss と表示層を用意し、fetch ラッパから push する配線は F-02 で。
// - id は単調増加のローカル整数（key として使えれば十分。timestamp は不要）
// - timeoutMs=0 で自動 dismiss を無効化（match_end モーダル等の永続通知用）
// - コンソールゼロ運用: エラー code はここでは扱わない（msg だけ表示、code は F-02
//   の fetch ラッパで開発ログ関数へ）

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface ToastItem {
	id: number;
	kind: ToastKind;
	message: string;
	timeoutMs?: number;
}

interface ToastContextValue {
	push: (toast: Omit<ToastItem, 'id'>) => number;
	dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<ToastItem[]>([]);
	const nextIdRef = useRef<number>(1);

	const push = useCallback((toast: Omit<ToastItem, 'id'>): number => {
		const id = nextIdRef.current;
		nextIdRef.current += 1;
		setToasts((prev) => [...prev, { ...toast, id }]);
		return id;
	}, []);

	const dismiss = useCallback((id: number) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	const value = useMemo<ToastContextValue>(() => ({ push, dismiss }), [push, dismiss]);

	return (
		<ToastContext.Provider value={value}>
			{children}
			<ToastViewport toasts={toasts} onDismiss={dismiss} />
		</ToastContext.Provider>
	);
}

export function useToast(): ToastContextValue {
	const v = useContext(ToastContext);
	if (!v) throw new Error('useToast must be used within <ToastProvider>');
	return v;
}
