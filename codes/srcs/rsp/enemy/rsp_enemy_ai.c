#include <math.h>

#include "core/core.h"
#include "enemy/enemy_utils.h"
#include "tuning.h"

/* ************************************************************************** */

void
	update_rsp_enemy(t_enemy* cur, t_game* game, double delta_time);
static int
	nearest_opponent(t_enemy* cur, t_game* game, t_pos* out_pos, t_hand* out_hand);
static void
	seek_rehand(t_enemy* cur, t_game* game, double delta_time, t_pos* opponent, int losing);
static void
	step_toward(t_enemy* cur, t_game* game, double delta_time, double x, double y, double mult);

/* ************************************************************************** */

// RSPのNPC1体ぶんのAI。最寄りの敵チーム戦闘員を見て、勝てる手なら直進で追跡、
// 負ける手・あいこなら手を変えに行く（seek_rehand）。相手が居なければ徘徊。移動は step_enemy が壁と他エンティティを避ける。
// 見た目は team×手のハンドテクスチャを毎フレーム反映する
// （リスポーンや手変更で手が変わると自動で差し替わる）
//
// **あいこで徘徊させない（#226）。** 手が変わるのは自陣スポーンへ踏み込んだ
// 瞬間だけ（rsp_combat.c の rehand_on_home_entry）なので、当てもなく歩くと
// 偶然踏むまで同じ手のままになり、接触しても何も起きない状態が続く。
// 人間は自分で自陣へ戻れるので、AI も同じ場所へ向かわせて条件を揃える
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
			step_toward(cur, game, delta_time, target.x, target.y,
				ENEMY_TRACK_SPEED_MULT * RSP_ENEMY_SPEED_MULT);
		} else {
			seek_rehand(cur, game, delta_time, &target, res == RSP_LOSE);
		}
	} else {
		patrol_enemy(cur, game, delta_time, RSP_ENEMY_SPEED_MULT);
	}
	cur->sprite->tex = &game->assets.hand_tex[HAND_SLOT(cur->rsp.team, cur->rsp.hand)];
}

/* ************************************************************************** */

// 今の手では勝てない（負け・あいこ）ので、手を変えに行く。手が変わるのは自陣
// スポーンマスへ「新しく」踏み込んだときだけなので（#270）、
// - 自陣の外にいれば自陣スポーンへ向かう（以前の負け分岐は相手の真逆へ逃げるだけで、
//   隅に押し込まれたまま手を変えられなかった。#262）
// - すでに自陣にいれば、いったん外へ出る。乗ったまま自陣を目指しても移動量が 0 で
//   永久に止まるため。出た次の tick には自陣へ戻り、入り直しで手が変わる。
//   負けなら相手から離れる向き、あいこなら接触しても何も起きないので相手の方へ出る
//   （離れる向きにすると接触の機会が減り、決着率が大きく下がった）
// 速さは追跡（勝ち側）より遅い通常速度にする。追跡と同じ速さだと負け側が必ず
// 逃げ切って手を変えてしまい、接触が起きず試合が決着しない
static void
	seek_rehand(t_enemy* cur, t_game* game, double delta_time, t_pos* opponent, int losing)
{
	t_pos*	pos;
	double	sign;

	pos = &cur->sprite->pos;
	if (!cur->rsp.on_home) {
		step_toward(cur, game, delta_time, cur->rsp.spawn.x, cur->rsp.spawn.y,
			RSP_ENEMY_SPEED_MULT);
		return ;
	}
	sign = 1.0;
	if (losing) {
		sign = -1.0;
	}
	step_toward(cur, game, delta_time, pos->x + sign * (opponent->x - pos->x),
		pos->y + sign * (opponent->y - pos->y), RSP_ENEMY_SPEED_MULT);
}

/* ************************************************************************** */

// (x, y) の方へ向きを変えて1歩進める。壁と他エンティティの回避は step_enemy に任せる。
// その1歩が阻まれて予定の半分も進めなければ、左・右・後ろの順に避ける（#270）。
// 「全く動けない」で判定しないのは、斜めに進もうとすると2軸のうち片方だけがわずかに
// 動き、詰まったまま微動し続けるため。当たり判定は
// 「円の中で中心へ近づく移動」を禁じるので、向かい合った2体（追跡中の AI と、そこを
// 通って自陣へ帰りたい味方など）は互いに一歩も進めず、そのまま試合が終わらなくなる。
// 後ろまで試すのは、障害物に左右を挟まれた自陣マス（rsp_pillars の W/E）で、出口を
// 味方にふさがれると直角にも動けないため
static void
	step_toward(t_enemy* cur, t_game* game, double delta_time, double x, double y, double mult)
{
	const double	turns[] = {0.0, M_PI / 2.0, -M_PI / 2.0, M_PI};
	t_pos			before;
	double			angle;
	double			min_step;
	int				i;

	angle = atan2(y - cur->sprite->pos.y, x - cur->sprite->pos.x);
	min_step = 0.5 * game->config.enemy_speed * mult * calc_time_mult(delta_time);
	i = 0;
	while (i < 4) {
		copy_pos(&before, &cur->sprite->pos);
		cur->dir_angle = angle + turns[i];
		step_enemy(cur, game, delta_time, mult);
		if (dist_pos(&before, &cur->sprite->pos) >= min_step) {
			return ;
		}
		i++;
	}
}

/* ************************************************************************** */

// cur から見て最寄りの敵チーム戦闘員を探し、その位置と手を out_pos / out_hand に
// 返す。見つかれば 1、敵が居なければ 0。味方は対象外。戦闘員統合によりプレイヤーも
// リストの1ノードなので、プレイヤーの特別扱いは不要になった
static int
	nearest_opponent(t_enemy* cur, t_game* game, t_pos* out_pos, t_hand* out_hand)
{
	t_enemy*	e;
	double		best;
	double		d;
	int			found;

	found = 0;
	best = 0.0;
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
