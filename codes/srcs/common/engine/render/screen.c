#include "core/core.h"            /* t_game 定義のため */
#include "core/respawn.h"         /* is_player_dead に必要 */
#include "engine/raycast/raycast.h"
#include "engine/render/render.h" /* 描画関数群の呼び出しに必要 */
#include "ui/ui.h"                /* update_ui, display_crosshair, write_ui_text に必要 */
#include "ui/font.h"              /* draw_text_scaled / FONT_* に必要 */
#include "tuning.h"               /* LIGHT_CONE_DEG に必要 */
#include "../minilibx-linux/mlx.h" /* mlx_put_image_to_window 用 */

/* ************************************************************************** */
void
	render_frame(t_game* game);
static void
	update_screen(t_game* game);
static void
	update_window(t_game* game);
static void
	draw_death_screen(t_game* game);
static void
	draw_clear_screen(t_game* game);
static void
	draw_centered_text(t_window* w, char* text, int y, int scale);

/* ************************************************************************** */
// 1フレーム全体を描画する。死亡中(is_player_dead)はワールドもUIも伏せ、死亡画像だけを描いて
// 即ウィンドウへ転送する。通常時は update_screen で世界を組み立て、update_window で反映する
void
	render_frame(t_game* game)
{
	if (game->cleared) {
		draw_clear_screen(game);
		if (!game->result_screenshot_saved) {
			game->result_screenshot_saved = 1;
			save_result_screenshot(game);
		}
		mlx_put_image_to_window(game->window.ptr, game->window.win, game->window.screen.img, 0, 0);
		return ;
	}
	if (is_player_dead(game)) {
		draw_death_screen(game);
		mlx_put_image_to_window(game->window.ptr, game->window.win, game->window.screen.img, 0, 0);
		return ;
	}
	update_screen(game);
	update_window(game);
}

/* ************************************************************************** */
// 画面を黒で消去し、描画に必要な状態を t_render スナップショットへ集約してから、列群を並列
// レイキャストする(cast_columns)。その上にスプライト→武器→照準→UIの順で重ねる。
// 懐中電灯を装備中ならフラッシュライトのフラグを立て、各描画の暗化補正に反映させる
static void
	update_screen(t_game* game)
{
	t_render	rnd;
	t_window*	w;
	t_pos		start;

	w = &game->window;
	set_pos(&start, 0, 0);
	draw_rectangle(w, &start, &w->size, 0x0);
	rnd.w = w;
	rnd.config = &game->config;
	rnd.camera = &game->camera;
	rnd.world = &game->world;
	rnd.tex = game->assets.tex;
	rnd.door_tex = &game->assets.door_tex;
	rnd.depth = game->cache.depth;
	rnd.sf_dist = game->cache.sf_dist;
	rnd.options = game->options;
	rnd.mode = game->mode;
	if (game->input.current_weapon == WEP_FLASHLIGHT) {
		rnd.options = rnd.options | FLAG_FLASHLIGHT;
	}
	cast_columns(&rnd, game->cache.camera_x);
	if (game->world.sprites) {
		draw_sprites(&rnd, game->world.sprites);
	}
	draw_weapon(game);
	if (game->options & FLAG_CROSSHAIR) {
		display_crosshair(w);
	}
	if (game->options & FLAG_UI) {
		update_ui(&rnd);
	}
}

/* ************************************************************************** */
// 完成したバッファ画像をウィンドウへ転送する。UIが有効なら、転送前に収集状況のテキストを
// 画面へ書き込んでおく
static void
	update_window(t_game* game)
{
	if (game->options & FLAG_UI) {
		write_ui_text(game);
	}
	mlx_put_image_to_window(game->window.ptr, game->window.win, game->window.screen.img, 0, 0);
}

/* ************************************************************************** */
// 死亡演出。バッファを黒で塗ってから死亡画像を画面全体へ最近傍補間で引き伸ばす。各画面ピクセル
// (pixel)に対応するテクセル(texel)を比率で求めてサンプリングする。画像未ロード時は黒画面のまま
static void
	draw_death_screen(t_game* game)
{
	t_window*	w;
	t_tex*		tex;
	t_pos		pixel;
	t_pos		texel;

	w = &game->window;
	set_pos(&pixel, 0, 0);
	draw_rectangle(w, &pixel, &w->size, 0x000000);
	tex = &game->assets.death_tex;
	if (!tex->tex) {
		return ;
	}
	pixel.y = 0;
	while (pixel.y < w->size.y) {
		texel.y = (int)(pixel.y * tex->height / w->size.y);
		pixel.x = 0;
		while (pixel.x < w->size.x) {
			texel.x = (int)(pixel.x * tex->width / w->size.x);
			draw_pixel(w, &pixel, get_tex_color(tex, &texel));
			pixel.x++;
		}
		pixel.x = 0;
		pixel.y++;
	}
}


/* ************************************************************************** */
// クリア画面。モードが組み立てた結果表示テキストを中央へ描画する
static void
	draw_clear_screen(t_game* game)
{
	t_window*	w;
	t_pos		start;
	char		title[UI_BUF_SIZE];
	char		detail[UI_BUF_SIZE];
	int		scale;

	w = &game->window;
	set_pos(&start, 0, 0);
	draw_rectangle(w, &start, &w->size, 0x000000);
	scale = w->size.y / 160;
	if (scale < 3) {
		scale = 3;
	}
	title[0] = 0;
	detail[0] = 0;
	game->mode_ops.build_result_text(game, title, UI_BUF_SIZE, detail, UI_BUF_SIZE);
	if (detail[0]) {
		draw_centered_text(w, title, (w->size.y / 2) - (FONT_H * scale), scale);
		draw_centered_text(w, detail, (w->size.y / 2) + (FONT_H * scale), scale);
		return ;
	}
	draw_centered_text(w, title, (w->size.y - (FONT_H * scale)) / 2, scale);
}

/* ************************************************************************** */
// 文字列を指定 y 座標で画面中央に描画する
static void
	draw_centered_text(t_window* w, char* text, int y, int scale)
{
	t_pos	start;
	int		text_w;

	text_w = ft_strlen(text) * FONT_W * scale;
	set_pos(&start, (w->size.x - text_w) / 2, y);
	draw_text_scaled(w, &start, text, scale, 0xFFFFFF);
}
