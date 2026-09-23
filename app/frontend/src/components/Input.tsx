import type { InputHTMLAttributes } from 'react';

// ④ §5 共通コンポーネント。FormField（label + Input + error）から呼ばれる想定で、
// ここは純粋な入力要素だけを持つ。エラー状態は aria-invalid で表現し、
// スタイルは data-invalid で流す（無理に prop を増やさない）

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
	invalid?: boolean;
}

// Select と見た目・invalid の扱いを共有するため、クラスの組み立てを切り出す
export function fieldClassName(isInvalid: boolean, className = ''): string {
	const base =
		'w-full rounded-md border bg-surface-low px-3 py-2 text-body text-fg ' +
		'placeholder:text-fg-subtle disabled:cursor-not-allowed disabled:opacity-60';
	const border = isInvalid
		? 'border-danger focus:border-danger-bright'
		: 'border-line focus:border-accent-bright';
	return `${base} ${border} ${className}`;
}

// CodeRabbit 指摘: `invalid` prop と、FormField が cloneElement で注入する
// `aria-invalid` の両方を1つの真偽に集約する。以前は border だけ invalid prop に
// 依存し、FormField 経由の error 時に aria-invalid=true でも border が着かなかった
export function resolveInvalid(invalid: boolean, ariaInvalid: unknown): boolean {
	return invalid || ariaInvalid === true || ariaInvalid === 'true';
}

export function Input({
	invalid = false,
	className = '',
	'aria-invalid': ariaInvalidProp,
	...rest
}: InputProps) {
	// aria-invalid はマージ後の値で描画し、rest による上書きを許さない
	const isInvalid = resolveInvalid(invalid, ariaInvalidProp);
	return (
		<input
			{...rest}
			aria-invalid={isInvalid || undefined}
			className={fieldClassName(isInvalid, className)}
		/>
	);
}
