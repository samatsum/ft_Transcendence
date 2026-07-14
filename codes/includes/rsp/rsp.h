#ifndef RSP_H
# define RSP_H

# include "utils/utils.h"

/* ************************************************************************** */
// チーム識別。赤＝プレイヤー＋味方NPC、青＝敵NPC2体。TEAM_COUNT は要素数で、
// ハンドテクスチャ配列のサイズ（TEAM_COUNT * HAND_COUNT）や添字計算に使う
typedef enum e_team
{
	TEAM_RED = 0,
	TEAM_BLUE,
	TEAM_COUNT
}				t_team;

// 手の種別。Rock=0,Scissors=1,Paper=2 の順にすることで、勝敗を
// (a - b + 3) % 3 の剰余演算1本で判定できる（rsp_outcome を参照）
typedef enum e_hand
{
	HAND_ROCK = 0,
	HAND_SCISSORS,
	HAND_PAPER,
	HAND_COUNT
}				t_hand;

// 勝敗の結果（rsp_outcome の戻り値）
typedef enum e_rsp_result
{
	RSP_DRAW = 0,
	RSP_WIN,
	RSP_LOSE
}				t_rsp_result;

/* ************************************************************************** */
// hand_tex[] の格納順 team * HAND_COUNT + hand を1箇所で定義（UI/NPC描画/配置で共有）
# define HAND_SLOT(team, hand)	((team) * HAND_COUNT + (hand))

/* ************************************************************************** */
// 戦闘員1人ぶんのRSP状態。プレイヤー集約と t_enemy の双方へ「1メンバ」として
// 埋め込む（案X）。後で外部テーブルへ剥がす場合もこの塊ごと移せるようにする。
// spawn は自チームの初期リスポーン地点、alive が 0 で死亡中
typedef struct s_rsp_state
{
	t_team	team;
	t_hand	hand;
	t_pos	spawn;
	int		alive;
}				t_rsp_state;

/* ************************************************************************** */
t_rsp_result
	rsp_outcome(t_hand a, t_hand b);
t_hand
	rsp_rehand(t_hand current, unsigned int* seed);

#endif
