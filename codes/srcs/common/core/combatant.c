#include <math.h>

#include "core/core.h"
#include "core/collision.h"
#include "tuning.h"

/* ************************************************************************** */
void
	step_external_combatants(t_game* game, double time_mult);
static void
	combatant_apply_input(t_game* game, t_enemy* cur, double time_mult);
static void
	combatant_walk(t_game* game, t_enemy* cur, t_pos dir, double speed);

/* ************************************************************************** */
// ローカルプレイヤー以外の外部入力席（サーバの人間席）へ、保持中の t_input を
// 1フレームぶん適用する。ローカルプレイヤーは従来どおりカメラ座標系の
// apply_input（浮動小数まで統合前と一致させる経路）で動くため対象外。
// 死亡中（復帰待ち）の席は動かさない。native/web の単体起動ではこの条件に合う
// 席が存在せず、完全な no-op になる
void
	step_external_combatants(t_game* game, double time_mult)
{
	t_enemy*	cur;

	cur = game->world.enemies;
	while (cur) {
		if (cur->input_source == INPUT_SRC_EXTERNAL && !cur->is_player
			&& cur->death_timer <= 0.0) {
			combatant_apply_input(game, cur, time_mult);
		}
		cur = cur->next;
	}
}

/* ************************************************************************** */
// 1席ぶんの論理入力を向きと位置へ反映する。回転はプレイヤーと同じ
// rotate_speed、移動はプレイヤーと同じ move_speed（素手装備時は走行倍率）を
// 使い、壁ずり・当たり円は共通の combatant_walk_axis に委譲する
static void
	combatant_apply_input(t_game* game, t_enemy* cur, double time_mult)
{
	double	speed;
	t_pos	dir;

	if (cur->input.rotate.x || cur->input.rotate.y) {
		cur->dir_angle += game->config.rotate_speed * time_mult
			* ((cur->input.rotate.x) ? -1.0 : 1.0);
	}
	speed = game->config.move_speed * time_mult * PLAYER_WALK_SPEED_MULT;
	if (cur->input.current_weapon == WEP_HANDS) {
		speed = game->config.move_speed * time_mult * PLAYER_RUN_SPEED_MULT;
	}
	set_pos(&dir, cos(cur->dir_angle), sin(cur->dir_angle));
	if (cur->input.move.x || cur->input.move.y) {
		combatant_walk(game, cur, dir, (cur->input.move.x) ? speed : -speed);
	}
	if (cur->input.x_move.x || cur->input.x_move.y) {
		set_pos(&dir, dir.y, -dir.x);
		combatant_walk(game, cur, dir, (cur->input.x_move.x) ? speed : -speed);
	}
}

/* ************************************************************************** */
// 指定方向へ軸分割で1フレームぶん歩く。X軸→Y軸の順に判定することで、片軸が
// 壁でももう片軸へ滑り込める「壁ずり」がプレイヤー移動（move_camera 系）と同じ
// 挙動になる
static void
	combatant_walk(t_game* game, t_enemy* cur, t_pos dir, double speed)
{
	t_pos	mv;

	set_pos(&mv, dir.x * speed, 0.0);
	combatant_walk_axis(game, cur->sprite, &cur->sprite->pos, mv);
	set_pos(&mv, 0.0, dir.y * speed);
	combatant_walk_axis(game, cur->sprite, &cur->sprite->pos, mv);
}
