#include <stdint.h>

#include "config/config.h"
#include "core/core.h"
#include "core/mode_ops.h"
#include "engine/render/render.h"
#include "types.h"

/* ************************************************************************** */
#define WEB_RENDER_WIDTH	960
#define WEB_RENDER_HEIGHT	540
#define WEB_OPTION_UI		0
#define WEB_OPTION_SHADOWS	1
#define WEB_OPTION_CROSSHAIR	2

/* ************************************************************************** */
int
	web_init(const char* map_text);
int
	web_render(double delta_time);
void
	web_set_input(int forward, int backward, int strafe_left, int strafe_right,
		int rotate_left, int rotate_right);
void
	web_toggle_option(int option);
int
	web_framebuffer_ptr(void);
int
	web_framebuffer_width(void);
int
	web_framebuffer_height(void);
int
	web_framebuffer_stride(void);

/* ************************************************************************** */
static t_game	g_game;
static int		g_ready;

/* ************************************************************************** */
// ゲート1用に fps_map/1.cub を読み込み、内部 960x540 の表示用ゲーム状態を初期化する
int
	web_init(const char* map_text)
{
	g_game = (t_game){0};
	g_game.mode = MODE_FPS;
	g_game.mode_ops = fps_mode_ops();
	init_config(&g_game.config);
	if (!parse_config_text(&g_game.config, map_text)) {
		return (0);
	}
	g_game.config.requested_width = WEB_RENDER_WIDTH;
	g_game.config.requested_height = WEB_RENDER_HEIGHT;
	init_game(&g_game);
	if (!finish_init(&g_game)) {
		return (0);
	}
	g_ready = 1;
	return (1);
}

/* ************************************************************************** */
// 1フレームぶん状態を進めてフレームバッファへ描画する。Canvas 転送は JS 側が行う
int
	web_render(double delta_time)
{
	if (!g_ready) {
		return (0);
	}
	game_step(&g_game, delta_time);
	render_frame(&g_game);
	return (1);
}

/* ************************************************************************** */
// JS から渡された押下状態を既存の入力構造へ反映する
void
	web_set_input(int forward, int backward, int strafe_left, int strafe_right,
		int rotate_left, int rotate_right)
{
	g_game.input.move.x = (double)(forward != 0);
	g_game.input.move.y = (double)(backward != 0);
	g_game.input.x_move.x = (double)(strafe_left != 0);
	g_game.input.x_move.y = (double)(strafe_right != 0);
	g_game.input.rotate.x = (double)(rotate_left != 0);
	g_game.input.rotate.y = (double)(rotate_right != 0);
}

/* ************************************************************************** */
// JS から渡されたオプション番号に対応する表示フラグを切り替える
void
	web_toggle_option(int option)
{
	if (option == WEB_OPTION_UI) {
		g_game.options = g_game.options ^ FLAG_UI;
	} else if (option == WEB_OPTION_SHADOWS) {
		g_game.options = g_game.options ^ FLAG_SHADOWS;
	} else if (option == WEB_OPTION_CROSSHAIR) {
		g_game.options = g_game.options ^ FLAG_CROSSHAIR;
	}
}

/* ************************************************************************** */
// JS が HEAPU8 で読むフレームバッファ先頭アドレスを返す
int
	web_framebuffer_ptr(void)
{
	return ((int)(uintptr_t)g_game.window.screen.pixels);
}

/* ************************************************************************** */
// フレームバッファ幅を返す
int
	web_framebuffer_width(void)
{
	return (g_game.window.screen.width);
}

/* ************************************************************************** */
// フレームバッファ高さを返す
int
	web_framebuffer_height(void)
{
	return (g_game.window.screen.height);
}

/* ************************************************************************** */
// フレームバッファの1行バイト数を返す
int
	web_framebuffer_stride(void)
{
	return (g_game.window.screen.stride);
}
