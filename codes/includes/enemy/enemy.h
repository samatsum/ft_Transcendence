#ifndef ENEMY_H
# define ENEMY_H

/* ************************************************************************** */
# include "enemy/enemy_types.h"

/* ************************************************************************** */
// 前方宣言
struct s_game;

/* ************************************************************************** */
t_enemy*
	add_enemy(t_enemy** enemies, t_sprite* sprite, int hp);
void
	clear_enemies(t_enemy** enemies);
void
	damage_enemy(struct s_game* game, t_sprite* hit_sprite);
int
	init_enemy_textures(struct s_game* game);
void
	update_enemies(struct s_game* game, double delta_time);

#endif
