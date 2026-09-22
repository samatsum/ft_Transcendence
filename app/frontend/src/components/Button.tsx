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
		'bg-accent text-fg-strong hover:bg-accent-bright disabled:bg-surface-hover disabled:text-fg-subtle',
	secondary:
		'bg-surface-hover text-fg hover:bg-surface-active disabled:bg-surface disabled:text-fg-subtle',
	danger:
		'bg-danger-strong text-fg-strong hover:bg-danger disabled:bg-surface-hover disabled:text-fg-subtle',
	ghost:
		'bg-transparent text-fg-secondary hover:bg-surface disabled:text-fg-disabled',
};

export function Button({
	variant = 'primary',
	fullWidth = false,
	className = '',
	type = 'button',
	...rest
}: ButtonProps) {
	const base =
		'inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-label ' +
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
