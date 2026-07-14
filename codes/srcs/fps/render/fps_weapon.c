#include <math.h>
#include "core/core.h"
#include "engine/render/render.h"
#include "engine/texture/texture.h"
#include "tuning.h"

/* ************************************************************************** */
#define SHOOT_INTERVAL		100
#define SHOOT_FRAMES_MAX	7
#define BOB_PERIOD			2000.0
#define BOB_POWER			3.0
#define WEAPON_SCALE		0.6
#define HAND_MOVE_RATIO		0.8

void
	render_fps_weapon(t_game* game);
static void
	update_weapon_timer(t_game* game, long long current_time);
static void
	render_hands(t_game* game, long long current_time);
static void
	render_item(t_game* game);

/* ************************************************************************** */
// FPSの武器/手描画の司令塔。射撃タイマーを進め、素手なら両手・それ以外は武器を描く
void
	render_fps_weapon(t_game* game)
{
	long long	current_time;

	current_time = get_current_time_ms();
	update_weapon_timer(game, current_time);
	if (game->input.current_weapon == WEP_HANDS) {
		render_hands(game, current_time);
	} else {
		render_item(game);
	}
}

/* ************************************************************************** */
// 射撃アニメーションのタイマー（状態）を更新する
static void
	update_weapon_timer(t_game* game, long long current_time)
{
	static long long	last_update = 0;

	if (game->input.is_shooting > 0 && (current_time - last_update) >= SHOOT_INTERVAL) {
		game->input.is_shooting--;
		last_update = current_time;
	}
}

/* ************************************************************************** */
// 移動時の揺れ（ボビング）を計算し、両手を描画する
static void
	render_hands(t_game* game, long long current_time)
{
	t_tex*	active_tex;
	double	scale;
	double	start_x;
	double	start_y;
	double	angle;
	double	move_dist;
	double	bob_left;
	double	bob_right;
	int		is_moving;

	is_moving = game->input.move.x || game->input.move.y || game->input.x_move.x || game->input.x_move.y;
	if (!is_moving) {
		return ;
	}
	angle = (double)(current_time % (long long)BOB_PERIOD) / BOB_PERIOD * 2.0 * M_PI;
	bob_left = pow(fabs(sin(angle)), BOB_POWER);
	bob_right = pow(fabs(cos(angle)), BOB_POWER);
	active_tex = &game->assets.weapon_tex[WTEX_HAND_LEFT];
	if (active_tex->tex) {
		scale = (game->window.size.y * WEAPON_SCALE) / active_tex->height;
		move_dist = active_tex->height * scale * HAND_MOVE_RATIO;
		start_x = 0 - move_dist * bob_left;
		start_y = game->window.size.y - (active_tex->height * scale) + move_dist * bob_left;
		draw_overlay(game, active_tex, start_x, start_y, scale);
	}
	active_tex = &game->assets.weapon_tex[WTEX_HAND_RIGHT];
	if (active_tex->tex) {
		scale = (game->window.size.y * WEAPON_SCALE) / active_tex->height;
		move_dist = active_tex->height * scale * HAND_MOVE_RATIO;
		start_x = game->window.size.x - (active_tex->width * scale) + move_dist * bob_right;
		start_y = game->window.size.y - (active_tex->height * scale) + move_dist * bob_right;
		draw_overlay(game, active_tex, start_x, start_y, scale);
	}
}

/* ************************************************************************** */
// ピストルまたはフラッシュライトの適切なアニメーションフレームを描画する
static void
	render_item(t_game* game)
{
	t_tex*	active_tex;
	double	scale;
	double	start_x;
	double	start_y;

	if (game->input.current_weapon == WEP_PISTOL) {
		if (game->input.is_shooting > SHOOT_FRAMES_MAX) {
			active_tex = &game->assets.weapon_tex[WTEX_PISTOL_SHOOT];
		} else if (game->input.is_shooting > 0) {
			active_tex = &game->assets.weapon_tex[WTEX_PISTOL_RECOIL];
		} else {
			active_tex = &game->assets.weapon_tex[WTEX_PISTOL_IDLE];
		}
	} else if (game->input.current_weapon == WEP_FLASHLIGHT) {
		active_tex = &game->assets.weapon_tex[WTEX_FLASHLIGHT];
	} else {
		return ;
	}
	if (!active_tex->tex) {
		return ;
	}
	scale = (game->window.size.y * WEAPON_SCALE_SMALL) / active_tex->height;
	start_x = (game->window.size.x / 2.0) - ((active_tex->width * scale) / 2.0);
	start_y = game->window.size.y - (active_tex->height * scale);
	draw_overlay(game, active_tex, start_x, start_y, scale);
}
