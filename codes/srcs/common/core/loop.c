#include <stddef.h>
#include <sys/time.h>
#include "core/core.h"
#include "core/respawn.h"
#include "enemy/enemy.h"
#include "tuning.h"
#include "utils/utils.h"// PROFILE マクロのため

/* ************************************************************************** */
int
	main_loop(t_game* game);
double
	calc_time_mult(double delta_time);
static double
	frame_delta(t_game* game, double* time_mult);
static int
	apply_input(t_game* game, double time_mult);
long long
	get_current_time_ms(void);

/* ************************************************************************** */
// 毎フレーム実行。死亡中はタイマーのみ進め、生存中は入力・敵更新・接触判定を行う
int
	main_loop(t_game* game)
{
	double	delta_time;
	double	time_mult;
	int		update;

	delta_time = frame_delta(game, &time_mult);
	if (delta_time < 0.0) {
		return (0);// FPS上限未達：許可関数に sleep が無いため待機せず即戻る（ビジーウェイト）
	}
	if (!game->cleared && is_player_dead(game)) {
		update_death(game, delta_time);
		update_enemies(game, delta_time);
	} else if (!game->cleared) {
		update = apply_input(game, time_mult);
		if (game->options != game->last_options) {
			update = 1;
			game->last_options = game->options;
		}
		if (update) {
			check_quest(game);
		}
		if (!game->cleared) {
			update_enemies(game, delta_time);
			game->mode_ops.combat(game);
		}
	}
	PROFILE_START(render_frame);
	render_frame(game);
	PROFILE_END(render_frame);
	return (1);
}

/* ************************************************************************** */
// 経過時間(秒)をTARGET_FPS基準の時間倍率へ変換し、暴走防止のため上限でクランプする
double
	calc_time_mult(double delta_time)
{
	double	time_mult;

	time_mult = delta_time * TARGET_FPS;
	if (time_mult > MAX_TIME_MULT) {
		time_mult = MAX_TIME_MULT;
	}
	return (time_mult);
}

/* ************************************************************************** */
// 経過時間を算出してFPS制限を行い、時間倍率を計算する（制限内は負値を返す）
static double
	frame_delta(t_game* game, double* time_mult)
{
	long long	now;
	double		delta_time;

	now = get_current_time_ms();
	if (game->timing.last_time == 0) {
		game->timing.last_time = now;
	}
	delta_time = (double)(now - game->timing.last_time) / 1000.0;
	if (delta_time < (1.0 / TARGET_FPS)) {
		return (-1.0);
	}
	game->timing.last_time = now;
	*time_mult = calc_time_mult(delta_time);
	return (delta_time);
}

/* ************************************************************************** */
// 入力状態をカメラへ反映する（素手装備＝走行モード時は PLAYER_RUN_BOOST 倍速に補正）
static int
	apply_input(t_game* game, double time_mult)
{
	double	speed_mult;
	int		update;

	speed_mult = PLAYER_WALK_SPEED_MULT;
	if (game->input.current_weapon == WEP_HANDS) {
		speed_mult = PLAYER_RUN_SPEED_MULT;
	}
	update = 0;
	if (game->input.move.x || game->input.move.y) {
		update = move_camera(&game->camera, &game->config, &game->world, (game->input.move.x) ? 0 : 1, time_mult * speed_mult);
	}
	if (game->input.x_move.x || game->input.x_move.y) {
		update = move_perp_camera(&game->camera, &game->config, &game->world, (game->input.x_move.x) ? 0 : 1, time_mult * speed_mult);
	}
	if (game->input.rotate.x || game->input.rotate.y) {
		update = rotate_camera(&game->camera, &game->config, (game->input.rotate.x) ? 0 : 1, time_mult);
	}
	return (update);
}

/* ************************************************************************** */
// 現在のシステム時刻をミリ秒単位で取得する
long long
	get_current_time_ms(void)
{
	struct timeval	tv;

	gettimeofday(&tv, NULL);
	return ((long long)tv.tv_sec * 1000 + (long long)tv.tv_usec / 1000);
}
