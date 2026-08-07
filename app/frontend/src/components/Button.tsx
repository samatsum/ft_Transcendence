import type { ButtonHTMLAttributes } from 'react';

// ④ §5 共通コンポーネント最小セット。variant は仕様ではなく「色・余白の一貫性」を
// 優先する（見た目より使い分けの明快さ）。primary=主要動作、secondary=補助、
// danger=破壊的操作（退室/削除）、ghost=非強調

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: ButtonVariant;
	fullWidth?: boolean;
}

const VARIANT_CLASS: Record<ButtonVariant, string> = {
	primary:
		'bg-sky-500 text-white hover:bg-sky-400 disabled:bg-slate-700 disabled:text-slate-500',
	secondary:
		'bg-slate-700 text-slate-100 hover:bg-slate-600 disabled:bg-slate-800 disabled:text-slate-500',
	danger:
		'bg-rose-600 text-white hover:bg-rose-500 disabled:bg-slate-700 disabled:text-slate-500',
	ghost:
		'bg-transparent text-slate-200 hover:bg-slate-800 disabled:text-slate-600',
};

export function Button({
	variant = 'primary',
	fullWidth = false,
	className = '',
	type = 'button',
	...rest
}: ButtonProps) {
	const base =
		'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-medium ' +
		'transition-colors disabled:cursor-not-allowed';
	const width = fullWidth ? 'w-full' : '';
	return (
		<button
			type={type}
			className={`${base} ${VARIANT_CLASS[variant]} ${width} ${className}`}
			{...rest}
		/>
	);
}
