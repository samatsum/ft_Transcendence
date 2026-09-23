import type { ToastKind } from '../contexts/ToastContext.js';
import { CheckCircleIcon } from './icons/CheckCircleIcon.js';
import { ExclamationCircleIcon } from './icons/ExclamationCircleIcon.js';
import { InfoCircleIcon } from './icons/InfoCircleIcon.js';
import { WarningTriangleIcon } from './icons/WarningTriangleIcon.js';

// Toast と Alert が共有する「種類ごとのアイコンと色」。
// 種類を足すときはここと ToastKind を直せば両方に効く

export type StatusKind = ToastKind;

export const STATUS_ICON: Record<StatusKind, typeof InfoCircleIcon> = {
	info: InfoCircleIcon,
	success: CheckCircleIcon,
	warning: WarningTriangleIcon,
	error: ExclamationCircleIcon,
};

export const STATUS_ICON_CLASS: Record<StatusKind, string> = {
	info: 'text-accent-bright',
	success: 'text-success',
	warning: 'text-warning',
	error: 'text-danger',
};
