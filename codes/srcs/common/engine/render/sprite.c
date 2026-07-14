#include <math.h>                  /* fabs, sqrt 用 */
#include "core/core.h"             /* t_game 周辺の型のため */
#include "engine/render/render.h"   /* スプライト描画関数の宣言 */
#include "engine/texture/texture.h" /* get_tex_color, shade_color, flashlight_divide 等に必要 */
#include "engine/render/light.h"    /* spotlight_factor, spotlight_shade, apply_spotlight のため */

/* ************************************************************************** */
void
	draw_sprites(t_render* rnd, t_sprite* sprites);
static void
	init_draw_sprite(t_render* rnd, t_sprite* sprite, double inv_det, t_sprite_draw* spr);
static void
	draw_sprite(t_render* rnd, t_sprite* sprite, t_sprite_draw* spr, t_tex* tex);

/* ************************************************************************** */
// 全スプライトを奥から手前へ描く。カメラ行列の逆行列式 inv_det を一度だけ求めて各スプライトの
// 座標変換に使い回し、sort_sprites で距離降順に並べてから描画する。距離が極端に近い(<=0.1)
// ものは座標変換が発散するため描かずにスキップする
void
	draw_sprites(t_render* rnd, t_sprite* sprites)
{
	t_sprite*		sorted;
	t_sprite_draw	spr;
	double			inv_det;

	inv_det = 1. / ((rnd->camera->plane.x * rnd->camera->dir.y) - (rnd->camera->plane.y * rnd->camera->dir.x));
	sorted = sort_sprites(rnd->camera, sprites);
	while (sorted) {
		if (sorted->distance > .1) {
			init_draw_sprite(rnd, sorted, inv_det, &spr);
			draw_sprite(rnd, sorted, &spr, sorted->tex);
		}
		sorted = sorted->sorted;
	}
}

/* ************************************************************************** */
// スプライト描画の前計算。プレイヤー相対座標 pos をカメラ空間 transform へ変換する
// (transform.y が奥行き、transform.x が横ずれ)。そこから画面中心X sprite_screen、画面上の
// 表示サイズ spr_s、描画矩形 draw_x/draw_y を求め、画面外へはみ出す分は 0 でクランプする
static void
	init_draw_sprite(t_render* rnd, t_sprite* sprite, double inv_det, t_sprite_draw* spr)
{
	sprite_transform(rnd->camera, inv_det, sprite->pos, &spr->transform);
	spr->sprite_screen = (int)((rnd->w->size.x / 2.) * (1. + spr->transform.x / spr->transform.y));
	spr->spr_s.x = fabs(rnd->w->size.y / spr->transform.y);
	spr->spr_s.y = fabs(rnd->w->size.y / spr->transform.y);
	set_pos(&spr->draw_x,
		(int)(MAX(0, -spr->spr_s.x / 2. + spr->sprite_screen)),
		(int)(MAX(0, spr->spr_s.x / 2. + spr->sprite_screen)));
	set_pos(&spr->draw_y,
		(int)(MAX(0, -spr->spr_s.y / 2. + rnd->w->size.y / 2.)),
		(int)(MAX(0, spr->spr_s.y / 2. + rnd->w->size.y / 2.)));
	spr->draw_y_org = spr->draw_y.x;
}

/* ************************************************************************** */
// スプライトを列×行で走査して描く。列ごとに depth[] と奥行きを比べ、壁より手前(transform.y <
// depth)のときだけ描画して壁との前後関係を守る。距離は sqrt で線形化し、フラッシュライトと
// スポットライトで暗化を打ち消す。テクスチャの start/end でトリミングし、完全透明な
// テクセル(下位24bitが0)は書き込まないので背景が抜ける
static void
	draw_sprite(t_render* rnd, t_sprite* sprite, t_sprite_draw* spr, t_tex* tex)
{
	double	step_x;
	double	step_y;
	double	left_x;
	double	tex_pos_y_start;
	double	tex_pos_y;
	double	shade;
	double	sprite_dist;
	double	light;
	double	col_shade;
	double	spot;
	t_pos	tex_pos;
	t_pos	pixel;
	int		color;

	step_x = tex->width / spr->spr_s.x;
	step_y = tex->height / spr->spr_s.y;
	left_x = -spr->spr_s.x / 2. + spr->sprite_screen;
	tex_pos_y_start = (spr->draw_y_org - rnd->w->size.y / 2. + spr->spr_s.y / 2.) * step_y;
	shade = 1.0;
	if (rnd->options & FLAG_SHADOWS) {
		shade = sprite->distance / 3;
	}
	sprite_dist = sqrt(sprite->distance);
	spot = spotlight_factor(rnd->world, sprite->pos.x, sprite->pos.y);
	while (spr->draw_x.x < rnd->w->size.x && spr->draw_x.x < spr->draw_x.y) {
		if (spr->transform.y > 0. && spr->transform.y < rnd->depth[(int)spr->draw_x.x]) {
			light = flashlight_weight(rnd, (int)spr->draw_x.x);
			col_shade = flashlight_divide(shade, sprite_dist, light);
			col_shade = spotlight_shade(col_shade, spot);
			tex_pos.x = (int)(((int)spr->draw_x.x - left_x) * step_x);
			if (tex_pos.x >= tex->start.x && tex_pos.x <= tex->end.x) {
				spr->draw_y.x = spr->draw_y_org;
				tex_pos_y = tex_pos_y_start;
				pixel.x = spr->draw_x.x;
				while (spr->draw_y.x < rnd->w->size.y && spr->draw_y.x < spr->draw_y.y) {
					tex_pos.y = (int)tex_pos_y;
					if (tex_pos.y >= tex->height) {
						tex_pos.y = tex->height - 1;
					} else if (tex_pos.y < 0) {
						tex_pos.y = 0;
					}
					if (tex_pos.y > tex->start.y && tex_pos.y < tex->end.y) {
						color = shade_color(get_tex_color(tex, &tex_pos), col_shade);
						if ((color & 0x00FFFFFF)) {
							pixel.y = spr->draw_y.x;
							draw_pixel(rnd->w, &pixel, apply_spotlight(color, spot));
						}
					}
					tex_pos_y += step_y;
					spr->draw_y.x++;
				}
			}
		}
		spr->draw_x.x++;
	}
}
