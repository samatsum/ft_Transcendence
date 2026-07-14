#include <stdlib.h>
#include "core/core.h"
#include "engine/input/input.h"
#include "engine/input/keymap.h"
#include "engine/render/render.h"

/* ************************************************************************** */
#define SHOOT_COOLDOWN	10

// 移動・回転の制御軸ID（末尾の AXIS_COUNT は要素数を兼ねる）
typedef enum e_axis
{
	AXIS_FORWARD = 0,
	AXIS_BACKWARD,
	AXIS_STRAFE_L,
	AXIS_STRAFE_R,
	AXIS_ROTATE_L,
	AXIS_ROTATE_R,
	AXIS_COUNT
}	t_axis;

// 押下/離上で 1/0 を切り替える移動・回転キーと制御軸の対応エントリ
typedef struct s_hold_key
{
	int	keycode;
	int	axis;
}	t_hold_key;

int
	expose_hook(t_game* game);
int
	exit_hook(t_game* game);
int
	key_press(int keycode, t_game* game);
int
	key_release(int keycode, t_game* game);
void
	select_weapon(t_game* game, int weapon);
void
	trigger_shot(t_game* game);
static int
	set_hold_axis(t_game* game, int keycode, double value);
static void
	handle_action(int keycode, t_game* game);
static double*
	axis_field(t_game* game, int axis);

/* ************************************************************************** */
// 移動・回転キーと制御軸の対応表（移動はWASDのみ、左右矢印で回転）
static const t_hold_key	g_hold_keys[] = {
	{KEY_W, AXIS_FORWARD},
	{KEY_S, AXIS_BACKWARD},
	{KEY_A, AXIS_STRAFE_L},
	{KEY_D, AXIS_STRAFE_R},
	{KEY_LEFT, AXIS_ROTATE_L},
	{KEY_RIGHT, AXIS_ROTATE_R},
};

/* ************************************************************************** */
// ウィンドウ再描画イベント時の処理
int
	expose_hook(t_game* game)
{
	render_frame(game);
	pf_present(&game->window);
	return (0);
}

/* ************************************************************************** */
// ウィンドウの×ボタン等が押された際の終了処理
int
	exit_hook(t_game* game)
{
	return (exit_game(game, EXIT_SUCCESS));
}

/* ************************************************************************** */
// キー押下時：移動・回転状態のON、または単発アクションを処理する
int
	key_press(int keycode, t_game* game)
{
	if (!set_hold_axis(game, keycode, 1.0)) {
		handle_action(keycode, game);
	}
	return (0);
}

/* ************************************************************************** */
// キー解放時：移動・回転状態のOFF、またはUI切り替え・終了を処理する
int
	key_release(int keycode, t_game* game)
{
	if (set_hold_axis(game, keycode, 0.0)) {
		return (0);
	}
	if (keycode == KEY_ESC) {
		return (exit_game(game, EXIT_SUCCESS));
	} else if (keycode == KEY_I) {
		game->options = game->options ^ FLAG_UI;
	} else if (keycode == KEY_L) {
		game->options = game->options ^ FLAG_SHADOWS;
	} else if (keycode == KEY_O) {
		game->options = game->options ^ FLAG_CROSSHAIR;
	}
	return (0);
}

/* ************************************************************************** */
// 対応表とキーコードを照合し、一致した制御軸の状態を value に更新する
static int
	set_hold_axis(t_game* game, int keycode, double value)
{
	int	count;
	int	i;

	count = sizeof(g_hold_keys) / sizeof(g_hold_keys[0]);
	i = 0;
	while (i < count) {
		if (g_hold_keys[i].keycode == keycode) {
			*axis_field(game, g_hold_keys[i].axis) = value;
			return (1);
		}
		i++;
	}
	return (0);
}

/* ************************************************************************** */
// 武器を切り替える。モード制約（can_shoot）の判定ごと公開し、native のキー入力と
// web 入力（web_set_weapon）が同じ実体を通るようにする
void
	select_weapon(t_game* game, int weapon)
{
	if (!game->mode_ops.can_shoot) {
		return ;
	}
	if (weapon == WEP_PISTOL || weapon == WEP_FLASHLIGHT || weapon == WEP_HANDS) {
		game->input.current_weapon = weapon;
	}
}

/* ************************************************************************** */
// ピストル装備時にクールダウンを守って1発撃つ（native キー・web 入力の共通実体）
void
	trigger_shot(t_game* game)
{
	if (!game->mode_ops.can_shoot || game->input.current_weapon != WEP_PISTOL) {
		return ;
	}
	if (game->input.is_shooting == 0) {
		game->input.is_shooting = SHOOT_COOLDOWN;
		shoot_target(game);
	}
}

/* ************************************************************************** */
// 押下時のFPS専用アクション（武器切り替え・射撃）をキーコードから振り分ける
static void
	handle_action(int keycode, t_game* game)
{
	if (keycode == KEY_NUM_1) {
		select_weapon(game, WEP_PISTOL);
	} else if (keycode == KEY_NUM_2) {
		select_weapon(game, WEP_FLASHLIGHT);
	} else if (keycode == KEY_NUM_3) {
		select_weapon(game, WEP_HANDS);
	} else if (keycode == KEY_SPACE) {
		trigger_shot(game);
	}
}

/* ************************************************************************** */
// 制御軸の番号から、対応する状態フィールドのポインタを返す
static double*
	axis_field(t_game* game, int axis)
{
	if (axis == AXIS_FORWARD) {
		return (&game->input.move.x);
	} else if (axis == AXIS_BACKWARD) {
		return (&game->input.move.y);
	} else if (axis == AXIS_STRAFE_L) {
		return (&game->input.x_move.x);
	} else if (axis == AXIS_STRAFE_R) {
		return (&game->input.x_move.y);
	} else if (axis == AXIS_ROTATE_L) {
		return (&game->input.rotate.x);
	}
	return (&game->input.rotate.y);
}
