#ifndef RSP_GAME_H
# define RSP_GAME_H

# include "rsp/rsp.h"

/* ************************************************************************** */
// RSP配置の定数。RSP_TEAM_SPAWNS は1チームが使うスポーン地点数、RSP_COMBATANTS
// は戦闘員の総数（プレイヤー1 + NPC3 = 2チーム×2地点）。RSP_RED_DIRS /
// RSP_BLUE_DIRS は各チームに許可するスポーン向き文字（赤=N/W、青=S/E）
# define RSP_TEAM_SPAWNS	2
# define RSP_COMBATANTS		(TEAM_COUNT * RSP_TEAM_SPAWNS)
# define RSP_RED_DIRS		"NW"
# define RSP_BLUE_DIRS		"SE"
# define RSP_SCORE_LIMIT	10

/* ************************************************************************** */
// 前方宣言（t_game* を引数に取るのみでメンバ参照しないためインクルード不要）。
// RSPモード固有でゲーム全体（t_game）に作用する関数の窓口。common が依存する
// rsp.h（型・純粋ルール）とは分け、ここは fps/rsp 側からのみ include する
struct s_game;

/* ************************************************************************** */
int
	init_hand_textures(struct s_game* game);
void
	resolve_rsp_combat(struct s_game* game);
int
	setup_rsp_combatants(struct s_game* game);

#endif
