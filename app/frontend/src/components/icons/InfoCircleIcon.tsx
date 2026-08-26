import { IconBase, type IconProps } from './Icon.js';

// 「i」: 円 + 下寄りの縦線 + 上の点
export function InfoCircleIcon(props: IconProps) {
	return (
		<IconBase {...props}>
			<circle cx="12" cy="12" r="9" />
			<line x1="12" y1="11" x2="12" y2="16" />
			<circle cx="12" cy="8" r="0.75" fill="currentColor" stroke="none" />
		</IconBase>
	);
}
