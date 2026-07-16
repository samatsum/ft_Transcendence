#ifndef SIM_H
# define SIM_H

# include "types.h"

/* ************************************************************************** */
// sim 公開 API（① §3-B）の付随定義。game_step は core/core.h（native/web と
// 同一実体）を参照する。tick 番号はサーバ（Node 側）の所有物なので snapshot には
// 含めない（② §5-C: シリアライズと tick 付与は Node 側の責務）

// snapshot の match.state 値（② §5-C の waiting/playing/finished に対応。
// countdown はルーム層イベントで表現するため sim は waiting を報告しない）
# define SIM_STATE_PLAYING			1
# define SIM_STATE_FINISHED			2

// snapshot フラット配列（f64）のレイアウト:
//   [0]=state [1]=winner(-1=未決着) [2]=score_red [3]=score_blue [4]=戦闘員数 N
//   以降 N × SIM_SNAP_COMBATANT_DOUBLES:
//   [id, team, hand, x, y, dir_angle, alive, is_ai, respawn_s]
# define SIM_SNAP_HEADER_DOUBLES	5
# define SIM_SNAP_COMBATANT_DOUBLES	9

// マップ由来の敵ハザード（FPS の 'M'）へ振る id の起点。席 id（RSP=0..3 /
// FPS=0..1）と重ならない値にする
# define SIM_HAZARD_ID_BASE			8

/* ************************************************************************** */
// 試合ルール（② §4-B）。target_score は 0 で既定値（RSP_SCORE_LIMIT）
typedef struct s_match_rules
{
	int	target_score;
}				t_match_rules;

/* ************************************************************************** */
// sim 公開 API（① §3-B）。ヘッドレス（サーバ）専用で、描画・ウィンドウ・
// ファイル I/O を伴わない。失敗時は NULL / -1 / 0 を返しプロセスを終了しない
t_game*
	game_create(const char* cub_text, int mode, const t_match_rules* rules);
int
	game_add_combatant(t_game* game, int slot, int is_ai);
int
	game_set_input(t_game* game, int combatant_id, const t_input* input);
int
	game_set_input_source(t_game* game, int combatant_id, int source);
int
	game_snapshot(t_game* game, double* buf, int max_doubles);
void
	game_destroy(t_game* game);

/* ************************************************************************** */
// JS（Node）から呼ぶ薄いラッパ。② §6-B の「mv/yaw → t_input への写像は
// platform/headless 層の責務」を担い、yaw は絶対角として席の向きへ直接反映する
t_game*
	sim_create(const char* cub_text, int is_rsp, int target_score);
int
	sim_set_input(t_game* game, int combatant_id, int forward, int backward,
		int strafe_left, int strafe_right, double yaw);

#endif
