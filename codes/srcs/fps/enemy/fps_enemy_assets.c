#include <math.h>

#include "core/core.h"
#include "enemy/enemy.h"
#include "enemy/enemy_utils.h"

/* ************************************************************************** */
int
	init_enemy_textures(t_game* game);
void
	update_texture(t_enemy* cur, t_game* game, double target_angle);

/* ************************************************************************** */
// 8方向の敵テクスチャをメモリ上にロードし、描画境界(start/end)を初期化する
int
	init_enemy_textures(t_game* game)
{
	char*	paths[ENEMY_TEX_COUNT];
	int		i;

	paths[0] = "textures/enemy/Enemy_1.xpm";
	paths[1] = "textures/enemy/Enemy_2.xpm";
	paths[2] = "textures/enemy/Enemy_3.xpm";
	paths[3] = "textures/enemy/Enemy_4.xpm";
	paths[4] = "textures/enemy/Enemy_5.xpm";
	paths[5] = "textures/enemy/Enemy_6.xpm";
	paths[6] = "textures/enemy/Enemy_7.xpm";
	paths[7] = "textures/enemy/Enemy_8.xpm";
	i = 0;
	while (i < ENEMY_TEX_COUNT) {
		game->assets.enemy_tex[i].path = ft_strdup(paths[i]);
		if (!load_tex_image(&game->window, &game->assets.enemy_tex[i])) {
			return (0);
		}
		set_pos(&game->assets.enemy_tex[i].start, 0, 0);
		set_pos(&game->assets.enemy_tex[i].end, game->assets.enemy_tex[i].width, game->assets.enemy_tex[i].height);
		i++;
	}
	return (1);
}

/* ************************************************************************** */
// プレイヤーの視点に対する敵の相対角度から、適切な8方向テクスチャを選択する
void
	update_texture(t_enemy* cur, t_game* game, double target_angle)
{
	double	diff;
	int		diff_idx;
	int		tex_idx;

	diff = target_angle - cur->dir_angle;
	while (diff < 0.0) {
		diff += 2.0 * M_PI;
	}
	while (diff >= 2.0 * M_PI) {
		diff -= 2.0 * M_PI;
	}
	diff_idx = (int)(floor((diff + (M_PI / 8.0)) / (M_PI / 4.0))) % ENEMY_TEX_COUNT;
	tex_idx = (ENEMY_TEX_COUNT - diff_idx) % ENEMY_TEX_COUNT;
	cur->sprite->tex = &game->assets.enemy_tex[tex_idx];
}
