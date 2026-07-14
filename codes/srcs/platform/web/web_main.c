#include <stdint.h>

#include "config/config.h"
#include "core/core.h"
#include "core/mode_ops.h"
#include "engine/render/render.h"

/* ************************************************************************** */
#define WEB_RENDER_WIDTH	960
#define WEB_RENDER_HEIGHT	540
#define WEB_MAP_PATH		"/maps/fps_map/1.cub"

/* ************************************************************************** */
int
	web_init(void);
int
	web_render(double delta_time);
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
	web_init(void)
{
	g_game = (t_game){0};
	g_game.mode = MODE_FPS;
	g_game.mode_ops = fps_mode_ops();
	init_config(&g_game.config);
	if (!parse_config(&g_game.config, WEB_MAP_PATH)) {
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
