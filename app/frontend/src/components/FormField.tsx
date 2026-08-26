import { useId, type ReactElement } from 'react';

// ④ §3.1: 「エラーはフィールド直下に表示」の受け皿。
// 子は input/select/textarea を1つだけ受け取り、id/aria-describedby を注入する。
// 単一責務: label と error の紐付けだけを担い、装飾は含めない

export interface FormFieldProps {
	label: string;
	error?: string | null;
	hint?: string;
	required?: boolean;
	children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
}

export function FormField({ label, error, hint, required, children }: FormFieldProps) {
	const generatedId = useId();
	const fieldId = children.props.id ?? `field-${generatedId}`;
	const descId = error || hint ? `desc-${generatedId}` : undefined;
	const child = {
		...children,
		props: {
			...children.props,
			id: fieldId,
			'aria-describedby': descId,
			'aria-invalid': error ? true : undefined,
		},
	};
	return (
		<div className="flex flex-col gap-1">
			<label htmlFor={fieldId} className="text-label text-slate-200">
				{label}
				{required && <span className="ml-1 text-rose-400" aria-hidden>*</span>}
			</label>
			{child}
			{(error || hint) && (
				<p
					id={descId}
					className={`text-caption ${error ? 'text-rose-400' : 'text-slate-400'}`}
					role={error ? 'alert' : undefined}
				>
					{error || hint}
				</p>
			)}
		</div>
	);
}
