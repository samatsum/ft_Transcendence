#include <math.h>               /* hypot 用 */

#include "utils/utils.h"       /* 自身のプロトタイプ宣言・t_pos 型のため */

/* ************************************************************************** */
void
	set_pos(t_pos* pos, double x, double y);
void
	copy_pos(t_pos* pos, t_pos* org);
double
	dist_pos(t_pos* a, t_pos* b);

/* ************************************************************************** */
// 座標構造体 pos に x, y を設定する（2次元ベクトルへの値設定を一箇所に集約する小道具）
void
	set_pos(t_pos* pos, double x, double y)
{
	pos->x = x;
	pos->y = y;
}

/* ************************************************************************** */
// 座標構造体 org の x, y を pos へ複製する（ベクトルのコピーを一箇所に集約する小道具）
void
	copy_pos(t_pos* pos, t_pos* org)
{
	pos->x = org->x;
	pos->y = org->y;
}

/* ************************************************************************** */
// 2点 a, b の中心間ユークリッド距離を返す（hypot を一箇所に集約する小道具）
double
	dist_pos(t_pos* a, t_pos* b)
{
	return (hypot(a->x - b->x, a->y - b->y));
}
