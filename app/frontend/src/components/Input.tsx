import type { InputHTMLAttributes } from 'react';

// ④ §5 共通コンポーネント。FormField（label + Input + error）から呼ばれる想定で、
// ここは純粋な入力要素だけを持つ。エラー状態は aria-invalid で表現し、
// スタイルは data-invalid で流す（無理に prop を増やさない）

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
	invalid?: boolean;
}

export function Input({ invalid = false, className = '', ...rest }: InputProps) {
	const base =
		'w-full rounded-md border bg-slate-900 px-3 py-2 text-sm text-slate-100 ' +
		'placeholder:text-slate-500 disabled:cursor-not-allowed disabled:opacity-60';
	const border = invalid
		? 'border-rose-500 focus:border-rose-400'
		: 'border-slate-700 focus:border-sky-400';
	return (
		<input
			aria-invalid={invalid || undefined}
			className={`${base} ${border} ${className}`}
			{...rest}
		/>
	);
}
