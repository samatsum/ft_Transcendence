import { describe, expect, it } from 'vitest';

import { isRequired, type ManifestEntry } from './loadTextures.js';

// #165 の受入条件をそのまま固定する。
// loadTextures 本体は fetch と wasm ヒープを要るのでテストから呼べないため、
// 「どれを読むか」の判定だけを叩く。

const entry = (path: string): ManifestEntry => ({ path, tex: `assets/${path}.tex` });

// rsp.cub が実際に参照している wall / object の一部
const RSP_MAP = 'NO ./textures/wall/Wall_1.xpm\nSO ./textures/wall/Wall_2.xpm\n1 ./textures/object/Box.xpm\n';

describe('isRequired', () => {
	it('RSP では arm/ を読まない（腕は fps_assets.c だけが使う。72MB）', () => {
		expect(isRequired(entry('textures/arm/Arm_pistol.xpm'), RSP_MAP, 'rsp')).toBe(false);
	});

	it('FPS では hand/ を読まない（手は rsp_assets.c だけが使う。81MB）', () => {
		expect(isRequired(entry('textures/hand/Hand_Red_Paper.xpm'), RSP_MAP, 'fps')).toBe(false);
	});

	it('RSP では hand/ を読む', () => {
		expect(isRequired(entry('textures/hand/Hand_Red_Paper.xpm'), RSP_MAP, 'rsp')).toBe(true);
	});

	it('FPS では arm/ を読む', () => {
		expect(isRequired(entry('textures/arm/Arm_pistol.xpm'), RSP_MAP, 'fps')).toBe(true);
	});

	// init_enemy_textures はモード分岐の外で呼ばれ、失敗を致命扱いにする（#165 の範囲外）
	it('enemy/ は両モードとも読む', () => {
		for (const mode of ['rsp', 'fps'] as const) {
			expect(isRequired(entry('textures/enemy/Enemy_1.xpm'), RSP_MAP, mode)).toBe(true);
		}
	});

	it('full / press / interact / Goal は両モードとも読む', () => {
		for (const mode of ['rsp', 'fps'] as const) {
			for (const path of [
				'textures/full/Full_1.xpm',
				'textures/press/Press_E.xpm',
				'textures/interact/Door.xpm',
				'Goal.xpm',
			]) {
				expect(isRequired(entry(path), RSP_MAP, mode)).toBe(true);
			}
		}
	});

	// E-08 の既存挙動。モード判定を足しても変わらないことを確かめる
	it('wall / object はマップ本文が参照しているものだけ読む', () => {
		expect(isRequired(entry('textures/wall/Wall_1.xpm'), RSP_MAP, 'rsp')).toBe(true);
		expect(isRequired(entry('textures/wall/Wall_99.xpm'), RSP_MAP, 'rsp')).toBe(false);
		expect(isRequired(entry('textures/object/Box.xpm'), RSP_MAP, 'rsp')).toBe(true);
		expect(isRequired(entry('textures/object/Barrel.xpm'), RSP_MAP, 'rsp')).toBe(false);
	});
});
