#include "core/core.h"
#include "core/collision.h"
#include "tuning.h"

/* ************************************************************************** */
int
	is_blocked_by_enemies(t_pos* cur, t_pos* next, t_world* world, t_sprite* ignore);
int
	is_blocked_by_entities(t_pos* cur, t_pos* next, t_game* game, t_sprite* ignore);
static int
	is_entity_blocking(t_pos* cur, t_pos* next, t_pos* center, double radius);
static double
	dist_sq(t_pos* a, t_pos* b);

/* ************************************************************************** */
// 移動先 next が敵の当たり円に阻まれるか判定する（ignore は自分自身の除外用）
int
	is_blocked_by_enemies(t_pos* cur, t_pos* next, t_world* world, t_sprite* ignore)
{
	t_enemy*	e;

	e = world->enemies;
	while (e) {
		// 共通のPLAYER_RADIUSではなく、敵専用のENEMY_RADIUSを使用する
		if (e->sprite != ignore && is_entity_blocking(cur, next, &e->sprite->pos, ENEMY_RADIUS)) {
			return (1);
		}
		e = e->next;
	}
	return (0);
}

/* ************************************************************************** */
// 移動先 next がプレイヤーまたは他の敵の当たり円に阻まれるか判定する
int
	is_blocked_by_entities(t_pos* cur, t_pos* next, t_game* game, t_sprite* ignore)
{
	// プレイヤー（カメラ）の判定は元のPLAYER_RADIUSのままとする
	if (is_entity_blocking(cur, next, &game->camera.pos, PLAYER_RADIUS)) {
		return (1);
	}
	return (is_blocked_by_enemies(cur, next, &game->world, ignore));
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
