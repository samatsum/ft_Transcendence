#include <math.h>

#include "config/config.h"
#include "core/core.h"
#include "core/collision.h"
#include "enemy/enemy.h"
#include "enemy/enemy_utils.h"
#include "tuning.h"

/* ************************************************************************** */
void
	step_enemy(t_enemy* cur, t_game* game, double delta_time, double speed_mult);
static int
	enemy_can_move(t_enemy* cur, t_game* game, t_pos next, t_pos probe);

/* ************************************************************************** */
// 記録済みの方向(dir_angle)へ、壁と他エンティティを避けつつ指定倍率で1フレーム移動する。
// 壁判定は進行方向へ WALL_MARGIN を見込み、壁の手前で止めて食い込みを防ぐ。
// 基準速度は敵専用の enemy_speed（.cub の ES で可変。プレイヤーの move_speed とは独立）
void
	step_enemy(t_enemy* cur, t_game* game, double delta_time, double speed_mult)
{
	double	time_mult;
	double	speed;
	double	move_x;
	double	move_y;
	t_pos	next_pos;
	t_pos	probe;

	time_mult = calc_time_mult(delta_time);
	speed = game->config.enemy_speed * speed_mult * time_mult;
	move_x = cos(cur->dir_angle) * speed;
	move_y = sin(cur->dir_angle) * speed;
	set_pos(&next_pos, cur->sprite->pos.x + move_x, cur->sprite->pos.y);
	set_pos(&probe, next_pos.x + copysign(WALL_MARGIN, move_x), next_pos.y);
	if (enemy_can_move(cur, game, next_pos, probe)) {
		cur->sprite->pos.x += move_x;
	}
	set_pos(&next_pos, cur->sprite->pos.x, cur->sprite->pos.y + move_y);
	set_pos(&probe, next_pos.x, next_pos.y + copysign(WALL_MARGIN, move_y));
	if (enemy_can_move(cur, game, next_pos, probe)) {
		cur->sprite->pos.y += move_y;
	}
}

/* ************************************************************************** */
// next(実際の移動先)と probe(進行方向へ WALL_MARGIN 先)の両セルが壁・
// マップ外でなく、他エンティティにも阻まれないなら真。probe により壁の手前
// マージン分で止まり食い込みを防ぐ（壁から離れる移動は probe も離れるので許可される）
static int
	enemy_can_move(t_enemy* cur, t_game* game, t_pos next, t_pos probe)
{
	if (!IN_MAP(next, game->config) || IS_BLOCKING(MAP(next, game->config))) {
		return (0);
	}
	if (!IN_MAP(probe, game->config) || IS_BLOCKING(MAP(probe, game->config))) {
		return (0);
	}
	return (!is_blocked_by_entities(&cur->sprite->pos, &next, game, cur->sprite));
}
