import type { LobbyMode } from '@ft/shared';

import { FormField } from '../components/FormField.js';
import { Input } from '../components/Input.js';
import {
	DEFAULT_MAP_CHOICE,
	RANDOM_MAP_CHOICE,
	type GameMapOption,
} from './gameCustomization.js';

interface GameCustomizationFieldsProps {
	mode: LobbyMode;
	maps: GameMapOption[];
	mapChoice: string;
	targetScore: string;
	onMapChange: (mapChoice: string) => void;
	onTargetScoreChange: (targetScore: string) => void;
	disabled?: boolean;
	readOnly?: boolean;
	allowDefault?: boolean;
	mapHint?: string;
	targetScoreError?: string | null;
}

/** 部屋作成と参加中ルームの双方で使うゲーム設定フィールド */
export function GameCustomizationFields({
	mode,
	maps,
	mapChoice,
	targetScore,
	onMapChange,
	onTargetScoreChange,
	disabled = false,
	readOnly = false,
	allowDefault = false,
	mapHint,
	targetScoreError,
}: GameCustomizationFieldsProps) {
	const selectedMap = maps.find((map) => map.id === mapChoice);
	const mapLabel =
		mapChoice === RANDOM_MAP_CHOICE
			? 'ランダム'
			: selectedMap?.name ?? (mapChoice || 'サーバー既定');

	if (readOnly) {
		return (
			<div className="flex flex-col gap-2">
				<dl className="grid gap-3 sm:grid-cols-2">
					<div>
						<dt className="text-caption text-fg-muted">マップ</dt>
						<dd className="text-body">{mapLabel}</dd>
						{selectedMap && (
							<dd className="text-caption text-fg-muted">{selectedMap.description}</dd>
						)}
					</div>
					{mode === 'rsp' && (
						<div>
							<dt className="text-caption text-fg-muted">先取点</dt>
							<dd className="text-body">{targetScore}点</dd>
						</div>
					)}
				</dl>
				{mapHint && <p className="text-caption text-fg-muted">{mapHint}</p>}
			</div>
		);
	}

	return (
		<fieldset className="flex flex-col gap-4" disabled={disabled}>
			<legend className="text-label mb-2">ゲーム設定</legend>
			<FormField label="マップ" hint={mapHint} required={!allowDefault}>
				<select
					value={mapChoice}
					onChange={(event) => onMapChange(event.target.value)}
					className="w-full rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-body text-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{allowDefault && <option value={DEFAULT_MAP_CHOICE}>サーバー既定</option>}
					<option value={RANDOM_MAP_CHOICE}>ランダム</option>
					{maps.map((map) => (
						<option key={map.id} value={map.id}>
							{map.name}
						</option>
					))}
				</select>
			</FormField>

			{selectedMap && <p className="text-caption text-fg-muted">{selectedMap.description}</p>}

			{mode === 'rsp' && (
				<FormField
					label="先取点"
					required
					hint="3〜21点。既定は10点です。"
					error={targetScoreError}
				>
					<Input
						type="number"
						min={3}
						max={21}
						step={1}
						value={targetScore}
						onChange={(event) => onTargetScoreChange(event.target.value)}
						inputMode="numeric"
					/>
				</FormField>
			)}
		</fieldset>
	);
}
