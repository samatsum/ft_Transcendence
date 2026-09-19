import type { InputHTMLAttributes } from 'react';

// ④ §5 共通コンポーネント。FormField（label + Input + error）から呼ばれる想定で、
// ここは純粋な入力要素だけを持つ。エラー状態は aria-invalid で表現し、
// スタイルは data-invalid で流す（無理に prop を増やさない）

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
	invalid?: boolean;
}

export function Input({
	invalid = false,
	className = '',
	'aria-invalid': ariaInvalidProp,
	...rest
}: InputProps) {
	// CodeRabbit 指摘: `invalid` prop と、FormField が cloneElement で注入する
	// `aria-invalid` の両方を1つの真偽に集約する。以前は border だけ invalid prop に
	// 依存し、FormField 経由の error 時に aria-invalid=true でも border が着かなかった。
	// aria-invalid はマージ後の値で描画し、rest による上書きを許さない
	const injected = ariaInvalidProp === true || ariaInvalidProp === 'true';
	const isInvalid = invalid || injected;
	const base =
		'w-full rounded-md border bg-surface-low px-3 py-2 text-body text-fg ' +
		'placeholder:text-fg-subtle disabled:cursor-not-allowed disabled:opacity-60';
	const border = isInvalid
		? 'border-danger focus:border-danger-bright'
		: 'border-line focus:border-accent-bright';
	return (
		<input
			{...rest}
			aria-invalid={isInvalid || undefined}
			className={`${base} ${border} ${className}`}
		/>
	);
}
