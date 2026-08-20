import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

// ④ §5 共通コンポーネント。match_end モーダルやカスタムルーム作成ダイアログの受け皿。
// Portal で body 直下に描いて、レイアウトの overflow/transform に巻き込まれないようにする。
// - Esc で close（要求文言化されていないが、キーボード操作の一般則）
// - focus trap は本 F-01 では**入れない**（依存最小 = 追加 lib 禁止）。
//   キーボード操作の完全性は F-11 のアクセシビリティ調整で拾う

export interface ModalProps {
	open: boolean;
	onClose: () => void;
	title?: string;
	children: ReactNode;
	/** 「戻るボタン」等のアクション行を渡す。undefined なら描画しない */
	actions?: ReactNode;
}

export function Modal({ open, onClose, title, children, actions }: ModalProps) {
	const dialogRef = useRef<HTMLDivElement | null>(null);

	// CodeRabbit 指摘: 以前は [open, onClose] を1つの effect にまとめており、
	// onClose の identity が変わるたびに dialogRef.focus() が再発火して
	// モーダル内の他要素からフォーカスを奪う恐れがあった。effect を2つに分ける:
	//   - open が false→true に変わった瞬間だけ dialog へフォーカス
	//     + open 前のフォーカス要素を退避し、close 時に復元
	//   - Escape ハンドラは onClose 変化にも追従する（focus には触らない）
	useEffect(() => {
		if (!open) return;
		const previouslyFocused = document.activeElement as HTMLElement | null;
		dialogRef.current?.focus();
		return () => {
			// close 時に元の要素へフォーカスを戻す（キーボード操作の連続性を保つ）
			previouslyFocused?.focus?.();
		};
	}, [open]);

	useEffect(() => {
		if (!open) return;
		function onKey(ev: KeyboardEvent) {
			if (ev.key === 'Escape') {
				ev.preventDefault();
				onClose();
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, onClose]);

	if (!open) return null;
	return createPortal(
		<div
			className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
			onClick={onClose}
		>
			<div
				ref={dialogRef}
				role="dialog"
				aria-modal="true"
				aria-labelledby={title ? 'modal-title' : undefined}
				tabIndex={-1}
				className="w-full max-w-md rounded-lg border border-slate-700 bg-slate-800 p-6 shadow-2xl outline-none"
				onClick={(ev) => ev.stopPropagation()}
			>
				{title && (
					<h2 id="modal-title" className="mb-3 text-heading-sm text-slate-100">
						{title}
					</h2>
				)}
				<div className="text-body text-slate-200">{children}</div>
				{actions && <div className="mt-4 flex justify-end gap-2">{actions}</div>}
			</div>
		</div>,
		document.body,
	);
}
