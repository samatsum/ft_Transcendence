import { Link, type LinkProps } from 'react-router-dom';
import { buttonClassName, type ButtonVariant } from './Button.js';

// ④ §5 共通コンポーネント。画面遷移するリンクをボタンの見た目で出す。
// <Link> の中に <Button> を入れると不正な HTML になるため、Button とはクラスだけを共有する

export interface LinkButtonProps extends LinkProps {
	variant?: ButtonVariant;
	fullWidth?: boolean;
}

export function LinkButton({
	variant = 'primary',
	fullWidth = false,
	className = '',
	...rest
}: LinkButtonProps) {
	return <Link className={buttonClassName(variant, fullWidth, className)} {...rest} />;
}
