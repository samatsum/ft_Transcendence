#include "config/config.h"          /* colors[] / TEX_* のため */
#include "engine/render/render.h"
#include "engine/texture/texture.h" /* get_tex_color, distance_shade 等を使うため */

/* ************************************************************************** */
void
	draw_wall(t_render* rnd, t_ray* ray);
static void
	init_draw_wall(t_tex* tex, t_ray* ray, t_pos* p_tex);
static void
	draw_textured_column(t_render* rnd, t_ray* ray, t_tex* tex, t_pos* p_tex, double light);

/* ************************************************************************** */
// 1列分の壁を描画する。扉なら扉テクスチャ、通常壁なら衝突面の向き direction のテクスチャを
// 選ぶ。テクスチャ未指定(tex->tex が NULL)なら距離暗化＋フラッシュライト補正をかけた単色の
// 縦線で代用し、ある場合はテクスチャX座標を求めてからテクスチャ列を描く
void
	draw_wall(t_render* rnd, t_ray* ray)
{
	t_pos	p_tex;
	t_pos	pixel;
	t_tex*	tex;
	double	light;

	if (ray->is_door) {
		tex = rnd->door_tex;
	} else {
		tex = &rnd->tex[ray->direction];
	}
	light = flashlight_weight(rnd, ray->column);
	if (!tex->tex) {
		set_pos(&pixel, ray->column, MAX(0, rnd->w->half.y - (ray->height / 2.)));
		draw_vertical_line(rnd->w, &pixel, ray->height,
			distance_shade(rnd->options, rnd->config->colors[ray->direction], ray->distance, light));
		return ;
	}
	init_draw_wall(tex, ray, &p_tex);
	draw_textured_column(rnd, ray, tex, &p_tex, light);
}

/* ************************************************************************** */
// 壁テクスチャのX座標を求める。衝突点が壁マスのどこを通ったか wall_x(0〜1の小数部)を計算し、
// テクスチャ幅へ写してテクスチャ列 p_tex->x にする。side と光線の向きの組み合わせによっては
// テクスチャが左右反転して見えるため、該当ケースで列を反転(width-x-1)して向きを揃える
static void
	init_draw_wall(t_tex* tex, t_ray* ray, t_pos* p_tex)
{
	if (ray->side) {
		ray->wall_x = ray->ray_pos.x + ((ray->map_pos.y - ray->ray_pos.y + (1. - ray->step.y) / 2.) / ray->ray_dir.y) * ray->ray_dir.x;
	} else {
		ray->wall_x = ray->ray_pos.y + ((ray->map_pos.x - ray->ray_pos.x + (1. - ray->step.x) / 2.) / ray->ray_dir.x) * ray->ray_dir.y;
	}
	ray->wall_x -= floor(ray->wall_x);
	p_tex->x = (int)(ray->wall_x * tex->width);
	if (ray->side == 0 && ray->ray_dir.x > 0.) {
		p_tex->x = tex->width - p_tex->x - 1.;
	} else if (ray->side == 1 && ray->ray_dir.y < 0.) {
		p_tex->x = tex->width - p_tex->x - 1.;
	}
}

/* ************************************************************************** */
// テクスチャ付き壁を1列ぶん、境界チェック無しでバックバッファへ直接書き込む。列xは画面内に
// 必ず収まり、yも開始(start_y>=0)と終端(end)で挟むため、draw_pixel の毎ピクセル境界判定と
// double→int 変換を省ける。step はテクスチャYの1ピクセルあたり増分、tex_pos は壁が画面外へ
// はみ出す分を見込んだ初期Y。ループ内は乗算を排し、dst を行ストライド刻みで縦に進める
static void
	draw_textured_column(t_render* rnd, t_ray* ray, t_tex* tex, t_pos* p_tex, double light)
{
	unsigned int*	dst;
	unsigned int*	end;
	int				stride;
	int				start_y;
	int				i;
	double			step;
	double			tex_pos;

	stride = rnd->w->screen.size_line / 4;
	start_y = (int)MAX(0, rnd->w->half.y - (ray->height / 2.));
	step = 1.0 * tex->height / ray->height;
	tex_pos = (start_y - rnd->w->size.y / 2.0 + ray->height / 2.0) * step;
	dst = (unsigned int*)rnd->w->screen.ptr + (int)ray->column + start_y * stride;
	end = (unsigned int*)rnd->w->screen.ptr + (int)ray->column + (int)rnd->w->size.y * stride;
	i = 0;
	while (i < ray->height && dst < end) {
		p_tex->y = (int)tex_pos;
		if (p_tex->y >= tex->height) {
			p_tex->y = tex->height - 1;
		} else if (p_tex->y < 0) {
			p_tex->y = 0;
		}
		*dst = (unsigned int)distance_shade(rnd->options, get_tex_color(tex, p_tex), ray->distance, light);
		dst += stride;
		tex_pos += step;
		i++;
	}
}
