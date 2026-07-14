#include <math.h>

#include "config/config.h"
#include "core/core.h"
#include "enemy/enemy.h"
#include "tuning.h"
#include "enemy/enemy_utils.h"

/* ************************************************************************** */
void
	patrol_enemy(t_enemy* cur, t_game* game, double delta_time, double speed_scale);
double
	wrap_pi(double angle);
static int
	face_angle(t_enemy* cur, double target_angle, double delta_time);
static int
	is_patrol(t_config* config, int x, int y);
static void
	rh_next(t_config* config, t_pos curp, t_pos prev, t_pos* out);
static int
	trace_cross(t_config* config, t_pos start, t_pos first, double* cross);
static void
	seed_patrol(t_enemy* cur, t_config* config, int cx, int cy);

/* ************************************************************************** */
// 非追跡時の徘徊。P上なら時計回り巡回、P外なら最近接Pへ復帰、不可なら待機する。
// 曲がり角では face_angle で向きを揃えてから前進する（向きが合うまでは静止して回頭）
void
	patrol_enemy(t_enemy* cur, t_game* game, double delta_time, double speed_scale)
{
	t_pos	next;
	int		cx;
	int		cy;
	double	tcx;
	double	tcy;

	cx = (int)floor(cur->sprite->pos.x);
	cy = (int)floor(cur->sprite->pos.y);
	if (!is_patrol(&game->config, cx, cy)) {
		cur->patrol_active = 0;
		if (!bfs_to_nearest_patrol(&game->config, cx, cy, &next)) {
			cur->state = ENEMY_STATE_IDLE;
			return ;
		}
		cur->state = ENEMY_STATE_PATROL;
		if (face_angle(cur, atan2((next.y + 0.5) - cur->sprite->pos.y, (next.x + 0.5) - cur->sprite->pos.x), delta_time)) {
			step_enemy(cur, game, delta_time, ENEMY_PATROL_SPEED_MULT * speed_scale);
		}
		return ;
	}
	if (!cur->patrol_active) {
		seed_patrol(cur, &game->config, cx, cy);
	}
	cur->state = ENEMY_STATE_PATROL;
	tcx = cur->patrol_target.x + 0.5;
	tcy = cur->patrol_target.y + 0.5;
	if (hypot(tcx - cur->sprite->pos.x, tcy - cur->sprite->pos.y) < ENEMY_PATROL_ARRIVE) {
		rh_next(&game->config, cur->patrol_target, cur->patrol_from, &next);
		copy_pos(&cur->patrol_from, &cur->patrol_target);
		copy_pos(&cur->patrol_target, &next);
		tcx = cur->patrol_target.x + 0.5;
		tcy = cur->patrol_target.y + 0.5;
	}
	if (face_angle(cur, atan2(tcy - cur->sprite->pos.y, tcx - cur->sprite->pos.x), delta_time)) {
		step_enemy(cur, game, delta_time, ENEMY_PATROL_SPEED_MULT * speed_scale);
	}
}

/* ************************************************************************** */
// 角度を (-π, π] へ正規化する。目標との差から最短の回転方向を求めるために使う
double
	wrap_pi(double angle)
{
	while (angle <= -M_PI) {
		angle += 2.0 * M_PI;
	}
	while (angle > M_PI) {
		angle -= 2.0 * M_PI;
	}
	return (angle);
}

/* ************************************************************************** */
// dir_angle を目標角へ旋回速度の上限で近づける。残り角が1フレーム分以下になれば
// 目標角へ吸着して 1(整列済み=前進可) を返し、まだ向きが合わなければ 0 を返す
static int
	face_angle(t_enemy* cur, double target_angle, double delta_time)
{
	double	diff;
	double	max_step;

	diff = wrap_pi(target_angle - cur->dir_angle);
	max_step = (ENEMY_TURN_DEG_PER_SEC * M_PI / 180.0 / TARGET_FPS) * calc_time_mult(delta_time);
	if (fabs(diff) <= max_step) {
		cur->dir_angle = target_angle;
		return (1);
	}
	if (diff > 0.0) {
		cur->dir_angle = wrap_pi(cur->dir_angle + max_step);
	} else {
		cur->dir_angle = wrap_pi(cur->dir_angle - max_step);
	}
	return (0);
}

/* ************************************************************************** */
// 指定セルがマップ範囲内かつ Pロード フラグを持つかを判定する
static int
	is_patrol(t_config* config, int x, int y)
{
	if (x < 0 || y < 0 || x >= config->map.columns || y >= config->map.rows) {
		return (0);
	}
	return ((FLAG_XY(x, y, *config) & CELL_PATROL) != 0);
}

/* ************************************************************************** */
// 来た方向(prev→curp)を基準に右手法則で次のPセルを選ぶ。無ければ来た道へ反転する
static void
	rh_next(t_config* config, t_pos curp, t_pos prev, t_pos* out)
{
	double	hx;
	double	hy;
	double	cand[3][2];
	int		i;

	hx = curp.x - prev.x;
	hy = curp.y - prev.y;
	cand[0][0] = -hy;
	cand[0][1] = hx;
	cand[1][0] = hx;
	cand[1][1] = hy;
	cand[2][0] = hy;
	cand[2][1] = -hx;
	i = 0;
	while (i < 3) {
		if (is_patrol(config, (int)(curp.x + cand[i][0]), (int)(curp.y + cand[i][1]))) {
			set_pos(out, curp.x + cand[i][0], curp.y + cand[i][1]);
			return ;
		}
		i++;
	}
	copy_pos(out, &prev);
}

/* ************************************************************************** */
// start→first 方向にループを一周トレースし、靴ひも符号を返す（閉路なら1）
static int
	trace_cross(t_config* config, t_pos start, t_pos first, double* cross)
{
	t_pos	prev;
	t_pos	curp;
	t_pos	nxt;
	int		steps;
	int		cap;

	copy_pos(&prev, &start);
	copy_pos(&curp, &first);
	*cross = (start.x * first.y) - (first.x * start.y);
	cap = config->map.rows * config->map.columns;
	steps = 0;
	while (!(curp.x == start.x && curp.y == start.y)) {
		if (steps++ > cap) {
			return (0);
		}
		rh_next(config, curp, prev, &nxt);
		if (nxt.x == prev.x && nxt.y == prev.y) {
			return (0);
		}
		*cross += (curp.x * nxt.y) - (nxt.x * curp.y);
		copy_pos(&prev, &curp);
		copy_pos(&curp, &nxt);
	}
	return (1);
}

/* ************************************************************************** */
// 巡回の初期方向を決める。閉路かつ反時計回り(cross<0)なら逆隣へ向けて時計回りに固定する
static void
	seed_patrol(t_enemy* cur, t_config* config, int cx, int cy)
{
	static const int	ox[4] = {0, 1, 0, -1};
	static const int	oy[4] = {-1, 0, 1, 0};
	t_pos				nb[4];
	t_pos				start;
	double				cross;
	int					n;
	int					i;

	set_pos(&start, cx, cy);
	n = 0;
	i = 0;
	while (i < 4) {
		if (is_patrol(config, cx + ox[i], cy + oy[i])) {
			set_pos(&nb[n++], cx + ox[i], cy + oy[i]);
		}
		i++;
	}
	copy_pos(&cur->patrol_from, &start);
	cur->patrol_active = 1;
	if (n == 0) {
		copy_pos(&cur->patrol_target, &start);
		return ;
	}
	copy_pos(&cur->patrol_target, &nb[0]);
	if (n >= 2 && trace_cross(config, start, nb[0], &cross) && cross < 0.0) {
		copy_pos(&cur->patrol_target, &nb[1]);
	}
}
