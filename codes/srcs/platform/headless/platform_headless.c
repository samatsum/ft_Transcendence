#include <stdlib.h>
#include <sys/time.h>

#include "core/core.h"
#include "engine/render/render.h"
#include "engine/texture/texture.h"
#include "platform/platform.h"

/* ************************************************************************** */
#define HEADLESS_DUMMY_BPP	32

/* ************************************************************************** */
int
	pf_init(t_window* window, int width, int height, const char* title);
int
	pf_create_framebuffer(t_window* window);
void
	pf_present(t_window* window);
int64_t
	pf_now_ms(void);
int
	pf_load_texture(t_window* window, t_tex* tex);
void
	pf_destroy_texture(t_window* window, t_tex* tex);
void
	pf_poll_events(t_input* input);
void
	pf_setup_hooks(t_game* game);
void
	pf_loop(t_window* window);
void
	pf_shutdown(t_window* window);

/* ************************************************************************** */
// ヘッドレスではウィンドウを作らず、サイズだけを控える
int
	pf_init(t_window* window, int width, int height, const char* title)
{
	(void)title;
	window->ptr = (void*)1;
	window->win = NULL;
	window->image = NULL;
	window->screen.width = width;
	window->screen.height = height;
	return (1);
}

/* ************************************************************************** */
// 描画しないためピクセルバッファは確保しない（サイズ情報のみ整える）
int
	pf_create_framebuffer(t_window* window)
{
	window->screen.pixels = NULL;
	window->screen.stride = 0;
	window->screen.width = (int)window->size.x;
	window->screen.height = (int)window->size.y;
	return (1);
}

/* ************************************************************************** */
// 表示先が無いため転送は何もしない
void
	pf_present(t_window* window)
{
	(void)window;
}

/* ************************************************************************** */
// システム時刻をミリ秒で返す（Emscripten/Node と native の両方で使える経路）
int64_t
	pf_now_ms(void)
{
	struct timeval	tv;

	gettimeofday(&tv, NULL);
	return ((int64_t)tv.tv_sec * 1000 + tv.tv_usec / 1000);
}

/* ************************************************************************** */
// ピクセルを読まないため、どのパスも 1x1 透明のダミーとして成功させる。
// これにより native と同じ資産初期化経路（load_player_assets 等）を分岐なしで
// 通せて、テクスチャ有無で挙動が割れない（パス契約 D-16 の検証はサーバの責務外）
int
	pf_load_texture(t_window* window, t_tex* tex)
{
	(void)window;
	tex->tex = malloc(sizeof(unsigned int));
	if (!tex->tex) {
		return (0);
	}
	*(unsigned int*)tex->tex = 0;
	tex->ptr = tex->tex;
	tex->width = 1;
	tex->height = 1;
	tex->bpp = HEADLESS_DUMMY_BPP;
	tex->size_line = sizeof(unsigned int);
	tex->endian = 0;
	return (1);
}

/* ************************************************************************** */
// ダミーテクスチャの所有メモリを解放する
void
	pf_destroy_texture(t_window* window, t_tex* tex)
{
	(void)window;
	free(tex->tex);
	tex->tex = NULL;
	tex->ptr = NULL;
}

/* ************************************************************************** */
// 入力はすべて game_set_input 経由のため polling は no-op
void
	pf_poll_events(t_input* input)
{
	(void)input;
}

/* ************************************************************************** */
// 駆動はサーバ（Node）の tick が担うためフックは持たない
void
	pf_setup_hooks(t_game* game)
{
	(void)game;
}

/* ************************************************************************** */
// C 側イベントループを持たない
void
	pf_loop(t_window* window)
{
	(void)window;
}

/* ************************************************************************** */
// pf_create_framebuffer が確保しないため解放も状態リセットのみ
void
	pf_shutdown(t_window* window)
{
	free(window->screen.pixels);
	window->screen.pixels = NULL;
	window->ptr = NULL;
}
