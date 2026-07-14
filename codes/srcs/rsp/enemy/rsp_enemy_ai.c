#include <math.h>

#include "core/core.h"
#include "enemy/enemy_utils.h"
#include "tuning.h"

/* ************************************************************************** */

void
	update_rsp_enemy(t_enemy* cur, t_game* game, double delta_time);
static int
	nearest_opponent(t_enemy* cur, t_game* game, t_pos* out_pos, t_hand* out_hand);

/* ************************************************************************** */

// RSPのNPC1体ぶんのAI。最寄りの敵チーム戦闘員を見て、勝てる手なら直進で追跡、
// 負ける手なら直進で逃走、あいこ・相手なしは徘徊。移動は step_enemy が壁と他
// エンティティを避ける。見た目は team×手のハンドテクスチャを毎フレーム反映する
// （リスポーンで手が変わると自動で差し替わる）
void
	update_rsp_enemy(t_enemy* cur, t_game* game, double delta_time)
{
	t_pos			target;
	t_hand			hand;
	t_rsp_result	res;

	if (nearest_opponent(cur, game, &target, &hand)) {
		res = rsp_outcome(cur->rsp.hand, hand);
		cur->state = ENEMY_STATE_WALK;
		if (res == RSP_WIN) {
			cur->dir_angle = atan2(target.y - cur->sprite->pos.y, target.x - cur->sprite->pos.x);
			step_enemy(cur, game, delta_time, ENEMY_TRACK_SPEED_MULT * RSP_ENEMY_SPEED_MULT);
		} else if (res == RSP_LOSE) {
			cur->dir_angle = atan2(cur->sprite->pos.y - target.y, cur->sprite->pos.x - target.x);
			step_enemy(cur, game, delta_time, ENEMY_TRACK_SPEED_MULT * RSP_ENEMY_SPEED_MULT);
		} else {
			patrol_enemy(cur, game, delta_time, RSP_ENEMY_SPEED_MULT);
		}
	} else {
		patrol_enemy(cur, game, delta_time, RSP_ENEMY_SPEED_MULT);
	}
	cur->sprite->tex = &game->assets.hand_tex[HAND_SLOT(cur->rsp.team, cur->rsp.hand)];
}

/* ************************************************************************** */

// cur から見て最寄りの敵チーム戦闘員（プレイヤーと他NPC）を探し、その位置と手を
// out_pos / out_hand に返す。見つかれば 1、敵が居なければ 0。味方は対象外
static int
	nearest_opponent(t_enemy* cur, t_game* game, t_pos* out_pos, t_hand* out_hand)
{
	t_enemy*	e;
	double		best;
	double		d;
	int			found;

	found = 0;
	best = 0.0;
	if (game->rsp.player.team != cur->rsp.team) {
		best = dist_pos(&game->camera.pos, &cur->sprite->pos);
		copy_pos(out_pos, &game->camera.pos);
		*out_hand = game->rsp.player.hand;
		found = 1;
	}
	e = game->world.enemies;
	while (e) {
		d = dist_pos(&e->sprite->pos, &cur->sprite->pos);
		if (e != cur && e->rsp.team != cur->rsp.team && (!found || d < best)) {
			best = d;
			copy_pos(out_pos, &e->sprite->pos);
			*out_hand = e->rsp.hand;
			found = 1;
		}
		e = e->next;
	}
	return (found);
}
