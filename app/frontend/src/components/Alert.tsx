import type { HTMLAttributes } from 'react';
import { STATUS_ICON, STATUS_ICON_CLASS, type StatusKind } from './statusKind.js';

// ④ §5 共通コンポーネント。ページ内に置いたままにするメッセージ枠（フォーム全体のエラーなど）。
// 一定時間で消える通知は Toast を使う。種類は Toast と同じ4つで、アイコンと色も共有する

export interface AlertProps extends HTMLAttributes<HTMLDivElement> {
	kind?: StatusKind;
}

const KIND_CLASS: Record<StatusKind, string> = {
	info: 'border-accent/40 bg-accent/10',
	success: 'border-success/40 bg-success/10',
	warning: 'border-warning/40 bg-warning/10',
	error: 'border-danger/40 bg-danger/10',
};

export function Alert({ kind = 'error', className = '', children, ...rest }: AlertProps) {
	const KindIcon = STATUS_ICON[kind];
	return (
		<div
			role={kind === 'error' ? 'alert' : 'status'}
			className={`flex items-start gap-3 rounded-md border px-3 py-2 text-body text-fg ${KIND_CLASS[kind]} ${className}`}
			{...rest}
		>
			<KindIcon className={`h-5 w-5 flex-shrink-0 ${STATUS_ICON_CLASS[kind]}`} />
			<div className="flex-1">{children}</div>
		</div>
	);
}
