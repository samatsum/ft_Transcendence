import { IconBase, type IconProps } from './Icon.js';

// 「!」: 円 + 上寄りの縦線 + 下の点（InfoCircleIcon と点/線の上下を反転）
export function ExclamationCircleIcon(props: IconProps) {
	return (
		<IconBase {...props}>
			<circle cx="12" cy="12" r="9" />
			<line x1="12" y1="7" x2="12" y2="13" />
			<circle cx="12" cy="16" r="0.75" fill="currentColor" stroke="none" />
		</IconBase>
	);
}
