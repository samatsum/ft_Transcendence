#include "core/core.h"
#include "engine/render/render.h"
#include "engine/texture/texture.h"

/* ************************************************************************** */
void
	draw_weapon(t_game* game);
void
	draw_overlay(t_game* game, t_tex* tex, double start_x, double start_y, double scale);

/* ************************************************************************** */
// 武器・手の描画を mode で振り分ける司令塔。RSPは自分のじゃんけんの手(weapon_rsp.c)、
// FPSは武器/素手(weapon_fps.c)を画面下部へ描く。実体は各モード側に置き、ここは振り分けのみ
void
	draw_weapon(t_game* game)
{
	game->mode_ops.draw_weapon(game);
}

/* ************************************************************************** */
// テクスチャを画面上の指定位置・スケールで描画する共通ヘルパー。FPS/RSP 両方の
// 手・武器描画から呼ばれる。透明(黒)ピクセルは描かない（ループの無駄を排除した最適化版）
void
	draw_overlay(t_game* game, t_tex* tex, double start_x, double start_y, double scale)
{
	t_pos	pixel;
	t_pos	p_tex;
	int		color;
	double	inv_scale;

	if (!tex->tex || scale == 0.0) {
		return ;
	}
	inv_scale = 1.0 / scale;
	pixel.y = start_y < 0 ? 0 : start_y;
	while (pixel.y < game->window.size.y && pixel.y < start_y + (tex->height * scale)) {
		p_tex.y = (int)((pixel.y - start_y) * inv_scale);
		if (p_tex.y >= 0 && p_tex.y < tex->height) {
			pixel.x = start_x < 0 ? 0 : start_x;
			while (pixel.x < game->window.size.x && pixel.x < start_x + (tex->width * scale)) {
				p_tex.x = (int)((pixel.x - start_x) * inv_scale);
				if (p_tex.x >= 0 && p_tex.x < tex->width) {
					color = get_tex_color(tex, &p_tex);
					if ((color & 0x00FFFFFF) != 0x000000) {
						draw_pixel(&game->window, &pixel, color);
					}
				}
				pixel.x++;
			}
		}
		pixel.y++;
	}
}
