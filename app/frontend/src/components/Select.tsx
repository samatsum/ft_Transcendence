import type { SelectHTMLAttributes } from 'react';
import { fieldClassName, resolveInvalid } from './Input.js';

// ④ §5 共通コンポーネント。Input の <select> 版。FormField から呼ばれる想定で、
// 見た目と invalid の扱いは Input と共有する（片方だけ直して食い違わないように）

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
	invalid?: boolean;
}

export function Select({
	invalid = false,
	className = '',
	'aria-invalid': ariaInvalidProp,
	...rest
}: SelectProps) {
	const isInvalid = resolveInvalid(invalid, ariaInvalidProp);
	return (
		<select
			{...rest}
			aria-invalid={isInvalid || undefined}
			className={fieldClassName(isInvalid, className)}
		/>
	);
}
