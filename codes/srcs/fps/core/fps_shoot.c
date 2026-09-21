#include <math.h>
#include <stdlib.h>
#include "core/core.h"
#include "engine/render/render.h"
#include "enemy/enemy.h"
#include "tuning.h"

/* ************************************************************************** */
void
	shoot_target(t_game* game);
static void
	check_hit(t_game* game, t_sprite* cur, t_sprite** tgt, double* min);
void
	shoot_from_combatant(t_game* game, t_enemy* shooter);
static double
	line_hit_distance(t_enemy* shooter, t_enemy* cur, t_pos dir);
static double
	wall_distance(t_config* config, t_pos from, t_pos dir);

/* ************************************************************************** */
// 画面中央に向けてレイを飛ばし、最も手前にあるスプライトを特定してダメージ処理へ渡す
void
	shoot_target(t_game* game)
{
	t_sprite*	current;
	t_sprite*	target;
	double		min_dist;

	current = game->world.sprites;
	target = NULL;
	min_dist = -1.0;
	while (current) {
		check_hit(game, current, &target, &min_dist);
		current = current->next;
	}
	if (target != NULL) {
		damage_enemy(game, target);
	}
}

/* ************************************************************************** */
// 単一のスプライトに対する射影変換と画面中央のヒット判定を行う
static void
	check_hit(t_game* game, t_sprite* cur, t_sprite** tgt, double* min)
{
	t_pos	tf;
	double	inv;
	int		scr_x;
	int		size;
	int		mid_x;

	inv = 1.0 / (game->camera.plane.x * game->camera.dir.y - game->camera.plane.y * game->camera.dir.x);
	sprite_transform(&game->camera, inv, cur->pos, &tf);
	if (tf.y <= 0.0) {
		return ;
	}
	scr_x = (int)((game->window.size.x / 2.0) * (1.0 + tf.x / tf.y));
	size = abs((int)(game->window.size.y / tf.y));
	if (game->window.size.x / 2 < -size / 2 + scr_x || game->window.size.x / 2 > size / 2 + scr_x) {
		return ;
	}
	if (game->window.size.y / 2 < -size / 2 + game->window.size.y / 2 || game->window.size.y / 2 > size / 2 + game->window.size.y / 2) {
		return ;
	}
	mid_x = (int)(game->window.size.x / 2.0);
	if (mid_x < 0 || mid_x >= MAX_WIDTH) {
		return ;
	}
	if (tf.y >= game->cache.depth[mid_x]) {
		return ;
	}
	if (*min == -1.0 || tf.y < *min) {
		*min = tf.y;
		*tgt = cur;
	}
}

/* ************************************************************************** */
// サーバ（sim）の席が向いている方向へ1発撃つ。shoot_target はローカルカメラと
// 描画の深度バッファで画面中央を判定するが、sim にはどちらも無いため、同じ
// 「射線上で最も手前の標的に当たり、壁・扉の向こうには届かない」を世界座標の
// 直線判定で表す。標的は戦闘員（席・ハザード）に限り、アイテム等の装飾
// スプライトと死亡中の席は射線を遮らない
void
	shoot_from_combatant(t_game* game, t_enemy* shooter)
{
	t_enemy*	cur;
	t_enemy*	target;
	t_pos		dir;
	double		nearest;
	double		dist;

	set_pos(&dir, cos(shooter->dir_angle), sin(shooter->dir_angle));
	nearest = wall_distance(&game->config, shooter->sprite->pos, dir);
	target = NULL;
	cur = game->world.enemies;
	while (cur) {
		dist = line_hit_distance(shooter, cur, dir);
		if (dist >= 0.0 && dist < nearest) {
			nearest = dist;
			target = cur;
		}
		cur = cur->next;
	}
	if (target != NULL) {
		damage_enemy(game, target->sprite);
	}
}

/* ************************************************************************** */
// 射線（撃ち手の位置から単位ベクトル dir 方向の半直線）が戦闘員に当たるなら、
// 撃ち手からの前方距離を返す。横ずれが SEAT_SHOT_HIT_RADIUS を超える・背後に
// いる・撃ち手本人・死亡中なら -1
static double
	line_hit_distance(t_enemy* shooter, t_enemy* cur, t_pos dir)
{
	t_pos	rel;
	double	along;
	double	lateral;

	if (cur == shooter || cur->death_timer > 0.0 || cur->state == ENEMY_STATE_DEAD) {
		return (-1.0);
	}
	set_pos(&rel, cur->sprite->pos.x - shooter->sprite->pos.x,
		cur->sprite->pos.y - shooter->sprite->pos.y);
	along = rel.x * dir.x + rel.y * dir.y;
	lateral = fabs(rel.x * dir.y - rel.y * dir.x);
	if (along <= 0.0 || lateral > SEAT_SHOT_HIT_RADIUS) {
		return (-1.0);
	}
	return (along);
}

/* ************************************************************************** */
// from から単位ベクトル dir 方向へ DDA でマス境界を辿り、最初に当たる壁・扉・
// マップ外までの直線距離を返す。描画の ray_cast と同じ遮蔽規則だが、魚眼補正は
// 不要なので side は光線に沿った距離のまま使う。軸に平行な光線はその軸の
// 境界を跨がないため、距離を実質無限大にして選ばれないようにする
static double
	wall_distance(t_config* config, t_pos from, t_pos dir)
{
	t_pos	cell;
	t_pos	step;
	t_pos	delta;
	t_pos	side;
	double	dist;

	set_pos(&cell, FINT(from.x), FINT(from.y));
	set_pos(&step, (dir.x < 0.0) ? -1.0 : 1.0, (dir.y < 0.0) ? -1.0 : 1.0);
	set_pos(&delta, (dir.x == 0.0) ? 1e30 : fabs(1.0 / dir.x),
		(dir.y == 0.0) ? 1e30 : fabs(1.0 / dir.y));
	set_pos(&side, (dir.x < 0.0) ? (from.x - cell.x) * delta.x : (cell.x + 1.0 - from.x) * delta.x,
		(dir.y < 0.0) ? (from.y - cell.y) * delta.y : (cell.y + 1.0 - from.y) * delta.y);
	if (dir.x == 0.0) {
		side.x = 1e30;
	}
	if (dir.y == 0.0) {
		side.y = 1e30;
	}
	while (1) {
		dist = (side.x < side.y) ? side.x : side.y;
		if (side.x < side.y) {
			side.x += delta.x;
			cell.x += step.x;
		} else {
			side.y += delta.y;
			cell.y += step.y;
		}
		if (!IN_MAP(cell, *config) || MAP(cell, *config) == '1' || IS_DOOR(MAP(cell, *config))) {
			return (dist);
		}
	}
}
