#include <stdlib.h>
#include <sys/time.h>

#include "core/core.h"
#include "engine/input/input.h"
#include "engine/input/keymap.h"
#include "engine/render/render.h"
#include "engine/texture/texture.h"
#include "mlx.h"
#include "platform/platform.h"

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
// MLX の接続とウィンドウを作成し、t_window の platform ハンドルへ保持する
int
	pf_init(t_window* window, int width, int height, const char* title)
{
	window->ptr = mlx_init();
	if (!window->ptr) {
		return (0);
	}
	window->win = mlx_new_window(window->ptr, width, height, (char*)title);
	if (!window->win) {
		return (0);
	}
	return (1);
}

/* ************************************************************************** */
// MLX イメージを作成し、そのピクセル領域を t_framebuffer として公開する
int
	pf_create_framebuffer(t_window* window)
{
	int	bpp;
	int	endian;

	window->image = mlx_new_image(window->ptr, window->size.x, window->size.y);
	if (!window->image) {
		return (0);
	}
	window->screen.pixels = mlx_get_data_addr(window->image, &bpp, &window->screen.stride, &endian);
	window->screen.width = (int)window->size.x;
	window->screen.height = (int)window->size.y;
	return (window->screen.pixels != NULL);
}

/* ************************************************************************** */
// 描画済みフレームバッファを MLX ウィンドウへ転送する
void
	pf_present(t_window* window)
{
	if (window->ptr && window->win && window->image) {
		mlx_put_image_to_window(window->ptr, window->win, window->image, 0, 0);
	}
}

/* ************************************************************************** */
// 現在時刻をミリ秒で返す
int64_t
	pf_now_ms(void)
{
	struct timeval	 tv;

	gettimeofday(&tv, NULL);
	return ((int64_t)tv.tv_sec * 1000 + (int64_t)tv.tv_usec / 1000);
}

/* ************************************************************************** */
// XPM ファイルを MLX 画像として読み込み、既存 t_tex 形式へ詰める
int
	pf_load_texture(t_window* window, t_tex* tex)
{
	tex->tex = mlx_xpm_file_to_image(window->ptr, tex->path, &tex->width, &tex->height);
	if (!tex->tex) {
		return (0);
	}
	tex->ptr = mlx_get_data_addr(tex->tex, &tex->bpp, &tex->size_line, &tex->endian);
	return (tex->ptr != NULL);
}

/* ************************************************************************** */
// MLX テクスチャ画像を破棄する
void
	pf_destroy_texture(t_window* window, t_tex* tex)
{
	if (tex->tex && window->ptr) {
		mlx_destroy_image(window->ptr, tex->tex);
	}
	tex->tex = NULL;
	tex->ptr = NULL;
}

/* ************************************************************************** */
// native 入力は MLX hook が push するため、poll 関数は境界維持用の no-op とする
void
	pf_poll_events(t_input* input)
{
	(void)input;
}

/* ************************************************************************** */
// 既存のキー/露出/終了フックを MLX に登録する
void
	pf_setup_hooks(t_game* game)
{
	mlx_hook(game->window.win, EVENT_KEY_PRESS, MASK_KEY_PRESS, &key_press, game);
	mlx_hook(game->window.win, EVENT_KEY_RELEASE, MASK_KEY_RELEASE, &key_release, game);
	mlx_hook(game->window.win, EVENT_EXIT, MASK_CLOSE, &exit_hook, game);
	mlx_hook(game->window.win, EVENT_EXPOSE, MASK_EXPOSE, &expose_hook, game);
	mlx_loop_hook(game->window.ptr, &main_loop, game);
}

/* ************************************************************************** */
// MLX のイベントループへ制御を渡す
void
	pf_loop(t_window* window)
{
	mlx_loop(window->ptr);
}

/* ************************************************************************** */
// ウィンドウ、バックバッファ、Display 接続を解放する
void
	pf_shutdown(t_window* window)
{
	if (window->image && window->ptr) {
		mlx_destroy_image(window->ptr, window->image);
		window->image = NULL;
	}
	if (window->ptr && window->win) {
		mlx_destroy_window(window->ptr, window->win);
		window->win = NULL;
	}
	if (window->ptr) {
		mlx_destroy_display(window->ptr);
		free(window->ptr);
		window->ptr = NULL;
	}
}
