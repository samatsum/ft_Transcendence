import type { ReactNode } from 'react';

// アイコン体系の共通土台。stroke-based（塗りではなく線）で統一し、
// currentColor で親のテキスト色を継承するので、text-danger 等の
// セマンティックカラートークンと組み合わせて使う想定。
// 個別アイコンはこの中に <circle>/<line>/<polyline> 等の図形だけを渡す

export interface IconProps {
	className?: string;
}

interface IconBaseProps extends IconProps {
	children: ReactNode;
}

export function IconBase({ className = 'h-5 w-5', children }: IconBaseProps) {
	return (
		<svg
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth={1.5}
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			aria-hidden="true"
		>
			{children}
		</svg>
	);
}
