#include <math.h>

#include "config/config.h"
#include "core/core.h"
#include "core/collision.h"
#include "enemy/enemy.h"
#include "enemy/enemy_utils.h"

/* ************************************************************************** */
void
	step_enemy(t_enemy* cur, t_game* game, double delta_time, double speed_mult);

/* ************************************************************************** */
// 記録済みの方向(dir_angle)へ、壁と他の戦闘員を避けつつ指定倍率で1フレーム移動する。
// 軸分割・WALL_MARGIN 先読み・当たり円判定はプレイヤーと共通の combatant_walk_axis に
// 一本化した（G-03）。基準速度は敵専用の enemy_speed（.cub の ES で可変。プレイヤーの
// move_speed とは独立）
void
	step_enemy(t_enemy* cur, t_game* game, double delta_time, double speed_mult)
{
	double	time_mult;
	double	speed;
	t_pos	mv;

	time_mult = calc_time_mult(delta_time);
	speed = game->config.enemy_speed * speed_mult * time_mult;
	set_pos(&mv, cos(cur->dir_angle) * speed, 0.0);
	combatant_walk_axis(game, cur->sprite, &cur->sprite->pos, mv);
	set_pos(&mv, 0.0, sin(cur->dir_angle) * speed);
	combatant_walk_axis(game, cur->sprite, &cur->sprite->pos, mv);
}
