#include "core/core.h"
#include "core/collision.h"
#include "tuning.h"

/* ************************************************************************** */
int
	is_blocked_by_enemies(t_pos* cur, t_pos* next, t_world* world, t_sprite* ignore);
void
	combatant_walk_axis(t_game* game, t_sprite* self, t_pos* pos, t_pos mv);
static int
	is_entity_blocking(t_pos* cur, t_pos* next, t_pos* center, double radius);
static double
	dist_sq(t_pos* a, t_pos* b);

/* ************************************************************************** */
// 移動先 next が他の戦闘員の当たり円に阻まれるか判定する（ignore は自分自身の
// 除外用）。半径は一律の定数ではなく各戦闘員の radius を使う: プレイヤーは
// PLAYER_RADIUS、NPC は ENEMY_RADIUS で、統合前の非対称な判定と一致させる
int
	is_blocked_by_enemies(t_pos* cur, t_pos* next, t_world* world, t_sprite* ignore)
{
	t_enemy*	e;

	e = world->enemies;
	while (e) {
		if (e->sprite != ignore && is_entity_blocking(cur, next, &e->sprite->pos, e->radius)) {
			return (1);
		}
		e = e->next;
	}
	return (0);
}

/* ************************************************************************** */
// 戦闘員1体を mv 方向（片軸ぶん。もう片方は 0）へ動かす試み。プレイヤーと NPC の
// 移動判定をこの1関数へ一本化する。移動先 next と、進行方向へ WALL_MARGIN 先読み
// した probe の両マスが「マップ内・非ブロッキング」で、他の戦闘員の当たり円にも
// 阻まれない場合だけ pos を確定する（壁の手前で止まり食い込みを防ぐ）
void
	combatant_walk_axis(t_game* game, t_sprite* self, t_pos* pos, t_pos mv)
{
	t_pos	next;
	t_pos	probe;

	copy_pos(&next, pos);
	next.x += mv.x;
	next.y += mv.y;
	set_pos(&probe, next.x + WALL_MARGIN * ((mv.x > 0.0) - (mv.x < 0.0)),
		next.y + WALL_MARGIN * ((mv.y > 0.0) - (mv.y < 0.0)));
	if (IN_MAP(next, game->config) && !IS_BLOCKING(MAP(next, game->config))
		&& IN_MAP(probe, game->config) && !IS_BLOCKING(MAP(probe, game->config))
		&& !is_blocked_by_enemies(pos, &next, &game->world, self)) {
		copy_pos(pos, &next);
	}
}

/* ************************************************************************** */
// 円内に入りつつ中心へ近づく移動だけを阻む（離れる移動は許しスタックを防ぐ）
static int
	is_entity_blocking(t_pos* cur, t_pos* next, t_pos* center, double radius)
{
	double	dist_next;
	double	dist_cur;

	dist_next = dist_sq(next, center);
	if (dist_next >= radius * radius) {
		return (0);
	}
	dist_cur = dist_sq(cur, center);
	if (dist_next >= dist_cur) {
		return (0);
	}
	return (1);
}

/* ************************************************************************** */
// 2点間のユークリッド距離の2乗を返す（sqrtを避けて比較を高速化する）
static double
	dist_sq(t_pos* a, t_pos* b)
{
	double	dx;
	double	dy;

	dx = a->x - b->x;
	dy = a->y - b->y;
	return ((dx * dx) + (dy * dy));
}
