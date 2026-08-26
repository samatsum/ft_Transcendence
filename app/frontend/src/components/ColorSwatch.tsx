// ④ §5 共通コンポーネント。index.css の @theme で定義したセマンティックカラー
// トークン（--color-*）を、名前 + 見本の四角として並べて見せるためだけの部品。
// DesignSystemPage から DesignSystem.Color を走査して呼ばれる想定

export interface ColorSwatchProps {
	name: string;
	className: string;
}

export function ColorSwatch({ name, className }: ColorSwatchProps) {
	return (
		<div className="flex flex-col items-center gap-2">
			<div className={`h-12 w-12 rounded-md border border-slate-700 ${className}`} aria-hidden />
			<code className="text-caption text-slate-400">{name}</code>
		</div>
	);
}
