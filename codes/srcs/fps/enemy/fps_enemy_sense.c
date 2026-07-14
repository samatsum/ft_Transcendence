#include <math.h>

#include "config/config.h"
#include "core/core.h"
#include "enemy/enemy.h"
#include "enemy/enemy_utils.h"

/* ************************************************************************** */
// 敵がプレイヤーを検知する正面視野の半角(ラジアン)。M_PI/8 = ±22.5°で、
// 8方向スプライトの「正面」表示と同じ画角に揃えている
# define ENEMY_FOV_HALF		(M_PI / 8.0)

// 敵がプレイヤーを検知できる最大距離(マス)。本来は無制限の想定だが、
// デバッグ用に上限を設けている。実質無制限にしたい場合は十分大きな値にする
# define ENEMY_SIGHT_RANGE	100.0

// 視線(LOS)判定でレイを1回に進める距離(マス)。小さいほど薄い壁も検出できる
# define ENEMY_LOS_STEP		0.05

/* ************************************************************************** */
int
	enemy_sees_player(t_enemy* cur, t_game* game, double target_angle);
static int
	has_line_of_sight(t_pos* from, t_pos* to, t_config* config);

/* ************************************************************************** */
// 距離・正面視野(FOV)・視線(LOS)の3条件でプレイヤーを検知できるか判定する
int
	enemy_sees_player(t_enemy* cur, t_game* game, double target_angle)
{
	double	diff;

	if (dist_pos(&game->camera.pos, &cur->sprite->pos) > ENEMY_SIGHT_RANGE) {
		return (0);
	}
	// 追跡中（track_timer > 0）でない場合のみ、厳密な視野角チェックを行う
	if (cur->track_timer <= 0.0) {
		diff = wrap_pi(target_angle - cur->dir_angle);
		if (fabs(diff) > ENEMY_FOV_HALF) {
			return (0);
		}
	}
	return (has_line_of_sight(&cur->sprite->pos, &game->camera.pos, &game->config));
}

/* ************************************************************************** */
// 始点から終点まで一定間隔でサンプリングし、間に遮蔽物が無いかを判定する
static int
	has_line_of_sight(t_pos* from, t_pos* to, t_config* config)
{
	t_pos	point;
	t_pos	step;
	double	dist;
	double	steps;
	int		i;

	dist = dist_pos(to, from);
	steps = dist / ENEMY_LOS_STEP;
	if (steps < 1.0) {
		return (1);
	}
	set_pos(&step, (to->x - from->x) / steps, (to->y - from->y) / steps);
	copy_pos(&point, from);
	i = 0;
	while (i < (int)steps) {
		point.x += step.x;
		point.y += step.y;
		if (!IN_MAP(point, *config) || IS_BLOCKING(MAP(point, *config))) {
			return (0);
		}
		i++;
	}
	return (1);
}
