import type { FpsAiSpeed, LobbyMode } from '@ft/shared';

import { FormField } from '../components/FormField.js';
import { Input } from '../components/Input.js';
import { Select } from '../components/Select.js';
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
	aiSpeed: FpsAiSpeed;
	onMapChange: (mapChoice: string) => void;
	onTargetScoreChange: (targetScore: string) => void;
	onAiSpeedChange: (aiSpeed: FpsAiSpeed) => void;
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
	aiSpeed,
	onMapChange,
	onTargetScoreChange,
	onAiSpeedChange,
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
	const aiSpeedLabel = {
		slow: '遅い',
		normal: '標準',
		fast: '速い',
	}[aiSpeed];

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
					{mode === 'fps' && (
						<div>
							<dt className="text-caption text-fg-muted">AI速度</dt>
							<dd className="text-body">{aiSpeedLabel}</dd>
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
				<Select
					value={mapChoice}
					onChange={(event) => onMapChange(event.target.value)}
				>
					{allowDefault && <option value={DEFAULT_MAP_CHOICE}>サーバー既定</option>}
					<option value={RANDOM_MAP_CHOICE}>ランダム</option>
					{maps.map((map) => (
						<option key={map.id} value={map.id}>
							{map.name}
						</option>
					))}
				</Select>
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

			{mode === 'fps' && (
				<FormField label="AI速度" required hint="AIの行動速度を3段階から選択します。">
					<Select
						value={aiSpeed}
						onChange={(event) => onAiSpeedChange(event.target.value as FpsAiSpeed)}
					>
						<option value="slow">遅い</option>
						<option value="normal">標準</option>
						<option value="fast">速い</option>
					</Select>
				</FormField>
			)}
		</fieldset>
	);
}
