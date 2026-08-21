import { useState, type ReactNode } from 'react';

import { DesignSystem } from '../components/design-system.js';
import { useToast } from '../contexts/ToastContext.js';

// 開発用の部品カタログ（Godot の Theme エディタに近い位置づけ）。
// components/design-system.ts の DesignSystem オブジェクトを走査して描画するので、
// 新しいタイポグラフィトークンやアイコンを追加すると自動的にここへ並ぶ。
// 本番ビルドには含めない（App.tsx 側で import.meta.env.DEV 限定のルートにする）

const { Button, Card, ColorSwatch, FormField, Input, Modal } = DesignSystem.UI;

function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="flex flex-col gap-4">
			<h2 className={DesignSystem.Typography.headingMd}>{title}</h2>
			{children}
		</section>
	);
}

export default function DesignSystemPage() {
	const [modalOpen, setModalOpen] = useState(false);
	const { push } = useToast();
	return (
		<div className="mx-auto flex max-w-4xl flex-col gap-10 px-4 py-12">
			<div>
				<h1 className={DesignSystem.Typography.headingLg}>Design System</h1>
				<p className="text-body text-slate-400">
					開発専用の部品一覧。本番ビルドには含まれません。
				</p>
			</div>

			<Section title="Typography">
				<div className="flex flex-col gap-3">
					{Object.entries(DesignSystem.Typography).map(([name, className]) => (
						<div key={name} className="flex items-baseline gap-4">
							<code className="w-32 shrink-0 text-caption text-slate-500">{name}</code>
							<span className={className}>The quick brown fox — サンプル文字列</span>
						</div>
					))}
				</div>
			</Section>

			<Section title="Color">
				<div className="grid grid-cols-3 gap-6 sm:grid-cols-4 md:grid-cols-6">
					{Object.entries(DesignSystem.Color).map(([name, className]) => (
						<ColorSwatch key={name} name={name} className={className} />
					))}
				</div>
			</Section>

			<Section title="Icon">
				<div className="flex flex-wrap gap-6">
					{Object.entries(DesignSystem.Icon).map(([name, IconComponent]) => (
						<div key={name} className="flex flex-col items-center gap-2">
							<IconComponent className="h-6 w-6 text-slate-100" />
							<code className="text-caption text-slate-500">{name}</code>
						</div>
					))}
				</div>
			</Section>

			<Section title="UI — Button">
				<div className="flex flex-wrap gap-3">
					{(['primary', 'secondary', 'danger', 'ghost'] as const).map((variant) => (
						<div key={variant} className="flex flex-col items-center gap-2">
							<Button variant={variant}>{variant}</Button>
							<code className="text-caption text-slate-500">variant=&quot;{variant}&quot;</code>
						</div>
					))}
				</div>
			</Section>

			<Section title="UI — Card">
				<Card>
					<p className="text-body text-slate-200">Card の中身は children 任せ</p>
				</Card>
			</Section>

			<Section title="UI — FormField + Input">
				<div className="max-w-sm">
					<FormField label="メールアドレス" hint="例: you@example.com">
						<Input type="email" placeholder="you@example.com" />
					</FormField>
				</div>
			</Section>

			<Section title="UI — Modal">
				<Button variant="secondary" onClick={() => setModalOpen(true)}>
					Modal を開く
				</Button>
				<Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Modal サンプル">
					<p className="text-body text-slate-200">これは Modal の中身です。</p>
				</Modal>
			</Section>

			<Section title="UI — Toast">
				<div className="flex flex-wrap gap-3">
					{(['info', 'success', 'warning', 'error'] as const).map((kind) => (
						<Button
							key={kind}
							variant="ghost"
							onClick={() => push({ kind, message: `${kind} トーストのサンプルです` })}
						>
							{kind} を表示
						</Button>
					))}
				</div>
			</Section>

			<Section title="UI — Header / Footer / Layout">
				<p className="text-body text-slate-400">
					この3つは構造用の部品です。単体では並べず、このページ自体の上下(Header/Footer)と
					全体の骨格(Layout)がそのまま実例になっています。
				</p>
			</Section>
		</div>
	);
}
