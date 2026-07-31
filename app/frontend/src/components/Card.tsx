import type { HTMLAttributes } from 'react';

// ④ §5 共通コンポーネント。「ロビーの座席カード / プロフィールの統計カード / 履歴行」など、
// 情報の1単位をまとめる箱。装飾は最小限、内容は children に任せる

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
	padded?: boolean;
}

export function Card({ padded = true, className = '', ...rest }: CardProps) {
	const base = 'rounded-lg border border-slate-700 bg-slate-800';
	const pad = padded ? 'p-4' : '';
	return <div className={`${base} ${pad} ${className}`} {...rest} />;
}
