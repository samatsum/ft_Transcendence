#include <math.h>
#include <stdlib.h>
#include "core/core.h"
#include "engine/render/render.h"
#include "enemy/enemy.h"

/* ************************************************************************** */
void
	shoot_target(t_game* game);
static void
	check_hit(t_game* game, t_sprite* cur, t_sprite** tgt, double* min);

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
