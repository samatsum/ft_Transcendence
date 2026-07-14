#ifndef COLLISION_H
# define COLLISION_H

# include "utils/utils.h"

/* ************************************************************************** */
// 当たり判定で参照するエンティティ型の前方宣言（ヘッダを軽量に保つため）
struct s_world;
struct s_game;
struct s_sprite;

/* ************************************************************************** */
int
	is_blocked_by_enemies(t_pos* cur, t_pos* next, struct s_world* world, struct s_sprite* ignore);
int
	is_blocked_by_entities(t_pos* cur, t_pos* next, struct s_game* game, struct s_sprite* ignore);

#endif
