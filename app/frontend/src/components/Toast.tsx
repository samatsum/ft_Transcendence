import { useEffect } from 'react';
import type { ToastItem, ToastKind } from '../contexts/ToastContext.js';
import { CloseIcon } from './icons/CloseIcon.js';
import { STATUS_ICON, STATUS_ICON_CLASS } from './statusKind.js';

// ④ §2「Toast: エラー・通知の共通表示枠（③§1-A のエラーエンベロープ `msg` を表示、
// `code` は開発者コンソールに出さない — コンソールゼロ運用）」
//
// この Toast コンポーネントは「表示だけ」を担当し、push/dismiss の状態管理は
// ToastContext（provider が右下に <ToastViewport /> を1つマウントする）に任せる。
// fetch ラッパ（F-02）から Toast を push する配線は F-02 の担当

const KIND_CLASS: Record<ToastKind, string> = {
	info: 'border-accent/40 bg-surface-low text-fg',
	success: 'border-success/40 bg-surface-low text-fg',
	warning: 'border-warning/40 bg-surface-low text-fg',
	error: 'border-danger/40 bg-surface-low text-fg',
};

interface ToastProps {
	toast: ToastItem;
	onDismiss: (id: number) => void;
}

const DEFAULT_TIMEOUT_MS = 5000;

function Toast({ toast, onDismiss }: ToastProps) {
	useEffect(() => {
		const t = toast.timeoutMs ?? DEFAULT_TIMEOUT_MS;
		if (t <= 0) return;
		const id = setTimeout(() => onDismiss(toast.id), t);
		return () => clearTimeout(id);
	}, [toast, onDismiss]);
	const KindIcon = STATUS_ICON[toast.kind];
	return (
		<div
			role={toast.kind === 'error' ? 'alert' : 'status'}
			className={`flex items-start gap-3 rounded-md border px-4 py-3 shadow-lg ${KIND_CLASS[toast.kind]}`}
		>
			<KindIcon className={`h-5 w-5 flex-shrink-0 ${STATUS_ICON_CLASS[toast.kind]}`} />
			<p className="flex-1 text-body">{toast.message}</p>
			<button
				type="button"
				onClick={() => onDismiss(toast.id)}
				className="text-fg-muted hover:text-fg-secondary"
				aria-label="通知を閉じる"
			>
				<CloseIcon className="h-4 w-4" />
			</button>
		</div>
	);
}

export interface ToastViewportProps {
	toasts: ToastItem[];
	onDismiss: (id: number) => void;
}

export function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
	return (
		<div
			className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex flex-col items-center gap-2 px-4"
			aria-live="polite"
		>
			<div className="pointer-events-auto flex w-full max-w-sm flex-col gap-2">
				{toasts.map((t) => (
					<Toast key={t.id} toast={t} onDismiss={onDismiss} />
				))}
			</div>
		</div>
	);
}
