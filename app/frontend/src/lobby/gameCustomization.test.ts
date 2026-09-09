import { describe, expect, it } from 'vitest';

import {
	DEFAULT_MAP_CHOICE,
	RANDOM_MAP_CHOICE,
	buildRoomCreateMessage,
	buildRoomUpdateRulesMessage,
	canEditRoomRules,
	type GameMapOption,
} from './gameCustomization.js';

const MAPS: GameMapOption[] = [
	{ id: 'rsp', name: 'Open Field', mode: 'rsp', description: 'open' },
	{ id: 'rsp_pillars', name: 'Pillars', mode: 'rsp', description: 'pillars' },
	{ id: 'fps_duel', name: 'Duel Run', mode: 'fps', description: 'duel' },
];

describe('buildRoomCreateMessage', () => {
	it.each(['3', '10', '21'])('RSPの先取点%sを受理する', (targetScore) => {
		const result = buildRoomCreateMessage({
			mode: 'rsp', mapChoice: 'rsp_pillars', targetScore, maps: MAPS,
		});
		expect(result).toEqual({
			success: true,
			message: {
				t: 'room_create',
				d: { mode: 'rsp', rules: { map: 'rsp_pillars', target_score: Number(targetScore) } },
			},
		});
	});

	it.each(['', '2', '22', '3.5'])('不正なRSP先取点%sを拒否する', (targetScore) => {
		const result = buildRoomCreateMessage({
			mode: 'rsp', mapChoice: DEFAULT_MAP_CHOICE, targetScore, maps: MAPS,
		});
		expect(result.success).toBe(false);
	});

	it('サーバー既定ではmapを省略する', () => {
		expect(buildRoomCreateMessage({
			mode: 'rsp', mapChoice: DEFAULT_MAP_CHOICE, targetScore: '10', maps: MAPS,
		})).toEqual({
			success: true,
			message: { t: 'room_create', d: { mode: 'rsp', rules: { target_score: 10 } } },
		});
	});

	it('ランダムの先頭と末尾を具体的なmap IDへ解決する', () => {
		const draft = { mode: 'rsp' as const, mapChoice: RANDOM_MAP_CHOICE, targetScore: '10', maps: MAPS };
		expect(buildRoomCreateMessage(draft, () => 0)).toMatchObject({
			success: true, message: { d: { rules: { map: 'rsp' } } },
		});
		expect(buildRoomCreateMessage(draft, () => 0.999999)).toMatchObject({
			success: true, message: { d: { rules: { map: 'rsp_pillars' } } },
		});
	});

	it('FPSでは先取点を送らない', () => {
		expect(buildRoomCreateMessage({
			mode: 'fps', mapChoice: 'fps_duel', targetScore: '2', maps: MAPS,
		})).toEqual({
			success: true,
			message: { t: 'room_create', d: { mode: 'fps', rules: { map: 'fps_duel' } } },
		});
	});

	it('別モードのマップIDを拒否する', () => {
		const result = buildRoomCreateMessage({
			mode: 'fps', mapChoice: 'rsp', targetScore: '10', maps: MAPS,
		});
		expect(result.success).toBe(false);
	});

	it('空の一覧ではランダムを拒否する', () => {
		const result = buildRoomCreateMessage({
			mode: 'rsp', mapChoice: RANDOM_MAP_CHOICE, targetScore: '10', maps: [],
		});
		expect(result.success).toBe(false);
	});
});

describe('buildRoomUpdateRulesMessage', () => {
	it('RSPの完全なcanonical rulesを生成する', () => {
		expect(buildRoomUpdateRulesMessage({
			mode: 'rsp', mapChoice: 'rsp', targetScore: '7', maps: MAPS,
		})).toEqual({
			success: true,
			message: { t: 'room_update_rules', d: { map: 'rsp', target_score: 7 } },
		});
	});

	it('FPSの完全なcanonical rulesを生成する', () => {
		expect(buildRoomUpdateRulesMessage({
			mode: 'fps', mapChoice: 'fps_duel', targetScore: '10', maps: MAPS,
		})).toEqual({
			success: true,
			message: { t: 'room_update_rules', d: { map: 'fps_duel' } },
		});
	});

	it('更新時はサーバー既定という不完全な指定を拒否する', () => {
		const result = buildRoomUpdateRulesMessage({
			mode: 'fps', mapChoice: DEFAULT_MAP_CHOICE, targetScore: '10', maps: MAPS,
		});
		expect(result.success).toBe(false);
	});

	it('ランダム更新を具体的なmap IDを含むcanonical rulesへ変換する', () => {
		expect(buildRoomUpdateRulesMessage({
			mode: 'rsp', mapChoice: RANDOM_MAP_CHOICE, targetScore: '10', maps: MAPS,
		}, () => 0.999999)).toMatchObject({
			success: true,
			message: { t: 'room_update_rules', d: { map: 'rsp_pillars', target_score: 10 } },
		});
	});
});

describe('canEditRoomRules', () => {
	const room = {
		room_id: '00000000-0000-4000-8000-000000000001',
		code: 'ABC123',
		mode: 'rsp' as const,
		host_id: 1,
		state: 'open' as const,
		rules: { map: 'rsp', target_score: 10 },
		seats: [],
	};

	it('open状態のホストだけを許可する', () => {
		expect(canEditRoomRules(room, 1)).toBe(true);
		expect(canEditRoomRules(room, 2)).toBe(false);
		expect(canEditRoomRules({ ...room, state: 'starting' }, 1)).toBe(false);
		expect(canEditRoomRules(null, 1)).toBe(false);
	});
});
