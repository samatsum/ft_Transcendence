import { IconBase, type IconProps } from './Icon.js';

// 三角 + 「!」。warning 用（error の ExclamationCircleIcon と区別する）
export function WarningTriangleIcon(props: IconProps) {
	return (
		<IconBase {...props}>
			<polygon points="12 3 21 20 3 20" />
			<line x1="12" y1="9" x2="12" y2="14" />
			<circle cx="12" cy="16.5" r="0.75" fill="currentColor" stroke="none" />
		</IconBase>
	);
}
