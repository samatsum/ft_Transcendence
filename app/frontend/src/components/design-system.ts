import { Button } from './Button.js';
import { Card } from './Card.js';
import { ColorSwatch } from './ColorSwatch.js';
import { Footer } from './Footer.js';
import { FormField } from './FormField.js';
import { Header } from './Header.js';
import { Input } from './Input.js';
import { Layout } from './Layout.js';
import { Modal } from './Modal.js';
import { ToastViewport } from './Toast.js';
import { CheckCircleIcon } from './icons/CheckCircleIcon.js';
import { CloseIcon } from './icons/CloseIcon.js';
import { ExclamationCircleIcon } from './icons/ExclamationCircleIcon.js';
import { InfoCircleIcon } from './icons/InfoCircleIcon.js';
import { WarningTriangleIcon } from './icons/WarningTriangleIcon.js';

// カスタムデザインシステムの部品一覧を1つの名前空間にまとめたカタログ。
// `DesignSystem.` と打つと UI / Icon / Typography / Color がエディタの補完候補に出る。
// DesignSystemPage（開発用一覧ページ）はこのオブジェクトを走査して描画する。
// 既存コードの import 方法（各ファイルからの直接 import）は変えない —
// これは新規追加分とカタログ専用の入口として並存させる

export const DesignSystem = {
	UI: {
		Button,
		Card,
		ColorSwatch,
		FormField,
		Input,
		Modal,
		ToastViewport,
		Header,
		Footer,
		Layout,
	},
	Icon: {
		Close: CloseIcon,
		Info: InfoCircleIcon,
		Check: CheckCircleIcon,
		Exclamation: ExclamationCircleIcon,
		Warning: WarningTriangleIcon,
	},
	Typography: {
		headingLg: 'text-heading-lg',
		headingMd: 'text-heading-md',
		headingSm: 'text-heading-sm',
		label: 'text-label',
		body: 'text-body',
		caption: 'text-caption',
	},
	Color: {
		bg: 'bg-bg',
		bgElevated: 'bg-bg-elevated',
		bgHover: 'bg-bg-hover',
		border: 'bg-border',
		fg: 'bg-fg',
		fgMuted: 'bg-fg-muted',
		accent: 'bg-accent',
		accentHover: 'bg-accent-hover',
		danger: 'bg-danger',
		success: 'bg-success',
		warning: 'bg-warning',
	},
} as const;
