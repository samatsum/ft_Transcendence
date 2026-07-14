#include <stdint.h>
#include <stdlib.h>

#include <emscripten/emscripten.h>

#include "core/core.h"
#include "engine/render/render.h"
#include "engine/texture/texture.h"
#include "platform/platform.h"
#include "utils/utils.h"

/* ************************************************************************** */
#define WEB_TEXTURE_MAX	256
#define WEB_BYTES_PER_PIXEL	4

/* ************************************************************************** */
typedef struct s_web_texture
{
	char*		path;
	uint32_t*	pixels;
	int			width;
	int			height;
} 	t_web_texture;

/* ************************************************************************** */
int
	web_register_texture(const char* path, const unsigned char* rgba, int width, int height);
static const char*
	normalized_path(const char* path);
static t_web_texture*
	find_texture(const char* path);
static void
	copy_rgba_as_native_pixels(t_web_texture* entry, const unsigned char* rgba);
static void
	copy_bytes(void* dst, const void* src, size_t size);
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
static t_web_texture	g_textures[WEB_TEXTURE_MAX];
static int				g_texture_count;

/* ************************************************************************** */
// JS が読み込んだ RGBA テクスチャを、C レンダラが読む 0xRRGGBB 配列へ変換して登録する
int
	web_register_texture(const char* path, const unsigned char* rgba, int width, int height)
{
	t_web_texture*	entry;

	if (!path || !rgba || width <= 0 || height <= 0 || g_texture_count >= WEB_TEXTURE_MAX) {
		return (0);
	}
	entry = &g_textures[g_texture_count];
	entry->path = ft_strdup(normalized_path(path));
	entry->width = width;
	entry->height = height;
	entry->pixels = (uint32_t*)malloc(sizeof(uint32_t) * (size_t)width * (size_t)height);
	if (!entry->path || !entry->pixels) {
		free(entry->path);
		free(entry->pixels);
		entry->path = NULL;
		entry->pixels = NULL;
		return (0);
	}
	copy_rgba_as_native_pixels(entry, rgba);
	g_texture_count++;
	return (1);
}

/* ************************************************************************** */
// 先頭の ./ を無視して native と web のパス表記差を吸収する
static const char*
	normalized_path(const char* path)
{
	while (path[0] == '.' && path[1] == '/') {
		path += 2;
	}
	return (path);
}

/* ************************************************************************** */
// 登録済みテクスチャから path と一致するものを探す
static t_web_texture*
	find_texture(const char* path)
{
	const char*	needle;
	int			i;

	needle = normalized_path(path);
	i = 0;
	while (i < g_texture_count) {
		if (ft_strcmp(g_textures[i].path, needle) == 0) {
			return (&g_textures[i]);
		}
		i++;
	}
	return (NULL);
}

/* ************************************************************************** */
// RGBA 入力を C 側の int 色値へ詰める。透明ピクセルは既存仕様どおり 0 として扱う
static void
	copy_rgba_as_native_pixels(t_web_texture* entry, const unsigned char* rgba)
{
	int			count;
	int			i;
	uint32_t	r;
	uint32_t	g;
	uint32_t	b;
	uint32_t	a;

	count = entry->width * entry->height;
	i = 0;
	while (i < count) {
		r = rgba[i * WEB_BYTES_PER_PIXEL];
		g = rgba[i * WEB_BYTES_PER_PIXEL + 1];
		b = rgba[i * WEB_BYTES_PER_PIXEL + 2];
		a = rgba[i * WEB_BYTES_PER_PIXEL + 3];
		if (a == 0) {
			entry->pixels[i] = 0;
		} else {
			entry->pixels[i] = (r << 16) | (g << 8) | b;
		}
		i++;
	}
}

/* ************************************************************************** */
// web では Canvas は JS 側が保持するため、C 側はサイズだけを控える
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
// WASM ヒープ上にバックバッファを確保する
int
	pf_create_framebuffer(t_window* window)
{
	size_t	size;

	window->screen.stride = (int)window->size.x * WEB_BYTES_PER_PIXEL;
	size = (size_t)window->screen.stride * (size_t)window->size.y;
	window->screen.pixels = malloc(size);
	window->screen.width = (int)window->size.x;
	window->screen.height = (int)window->size.y;
	return (window->screen.pixels != NULL);
}

/* ************************************************************************** */
// Canvas への転送は JS 側が HEAPU8 を読んで行う
void
	pf_present(t_window* window)
{
	(void)window;
}

/* ************************************************************************** */
// ブラウザの monotonic clock をミリ秒で返す
int64_t
	pf_now_ms(void)
{
	return ((int64_t)emscripten_get_now());
}

/* ************************************************************************** */
// 登録済み RGBA 由来テクスチャを t_tex へコピーする
int
	pf_load_texture(t_window* window, t_tex* tex)
{
	t_web_texture*	entry;
	size_t			size;

	(void)window;
	entry = find_texture(tex->path);
	if (!entry) {
		return (0);
	}
	size = sizeof(uint32_t) * (size_t)entry->width * (size_t)entry->height;
	tex->tex = malloc(size);
	if (!tex->tex) {
		return (0);
	}
	tex->ptr = tex->tex;
	tex->width = entry->width;
	tex->height = entry->height;
	tex->bpp = WEB_BYTES_PER_PIXEL * 8;
	tex->size_line = entry->width * WEB_BYTES_PER_PIXEL;
	tex->endian = 0;
	copy_bytes(tex->ptr, entry->pixels, size);
	return (1);
}

/* ************************************************************************** */
// 小さな byte copy。platform 層だけで使い、libc 依存を増やさない
static void
	copy_bytes(void* dst, const void* src, size_t size)
{
	unsigned char*	out;
	const unsigned char*	in;
	size_t			i;

	out = (unsigned char*)dst;
	in = (const unsigned char*)src;
	i = 0;
	while (i < size) {
		out[i] = in[i];
		i++;
	}
}

/* ************************************************************************** */
// web テクスチャの t_tex 所有コピーを解放する
void
	pf_destroy_texture(t_window* window, t_tex* tex)
{
	(void)window;
	free(tex->tex);
	tex->tex = NULL;
	tex->ptr = NULL;
}

/* ************************************************************************** */
// E-07 は静的描画のみなので入力 polling は no-op
void
	pf_poll_events(t_input* input)
{
	(void)input;
}

/* ************************************************************************** */
// E-07 の web は JS の requestAnimationFrame が駆動する
void
	pf_setup_hooks(t_game* game)
{
	(void)game;
}

/* ************************************************************************** */
// web では C 側イベントループを持たない
void
	pf_loop(t_window* window)
{
	(void)window;
}

/* ************************************************************************** */
// WASM 側バックバッファだけを解放する
void
	pf_shutdown(t_window* window)
{
	free(window->screen.pixels);
	window->screen.pixels = NULL;
	window->ptr = NULL;
}
