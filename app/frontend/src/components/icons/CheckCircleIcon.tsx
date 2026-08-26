import { IconBase, type IconProps } from './Icon.js';

export function CheckCircleIcon(props: IconProps) {
	return (
		<IconBase {...props}>
			<circle cx="12" cy="12" r="9" />
			<polyline points="8 12.5 10.5 15 16 9" />
		</IconBase>
	);
}
