#include "config/config.h"          /* colors[] / TEX_SKY / TEX_FLOOR のため */
#include "engine/render/render.h"
#include "engine/texture/texture.h" /* get_tex_color, distance_shade を使うため */
#include "engine/render/light.h"    /* spotlight_factor, apply_spotlight のため */

/* ************************************************************************** */
void
	draw_sky_floor(t_render* rnd, t_ray* ray);
static void
	init_draw_sky_floor(t_ray* ray);
static void
	draw_floor_pixel(t_render* rnd, t_ray* ray, t_pos* pixel, t_pos* p_tex, double light);
static void
	draw_sky_pixel(t_render* rnd, t_ray* ray, t_pos* pixel, t_pos* p_tex, double light);

/* ************************************************************************** */
// 壁より下の各行について、床と天井を1ピクセルずつ描く。weight = sf_dist[i]/distance は
// その行が床平面のどこに当たるかの内挿係数で、壁基準点 floor_wall とカメラ位置の線形補間で
// 実際の床ワールド座標 c_floor を求める。床は行 i、天井は上下対称の行 size.y - i に描画する
void
	draw_sky_floor(t_render* rnd, t_ray* ray)
{
	t_pos	pixel;
	t_pos	p_tex;
	double	weight;
	double	light;
	int		i;

	init_draw_sky_floor(ray);
	pixel.x = ray->column;
	light = flashlight_weight(rnd, ray->column);
	i = rnd->w->half.y + (ray->height / 2.);
	while (i < rnd->w->size.y) {
		ray->row = i;
		weight = rnd->sf_dist[i] / ray->distance;
		set_pos(&ray->c_floor,
			weight * ray->floor_wall.x + (1. - weight) * rnd->camera->pos.x,
			weight * ray->floor_wall.y + (1. - weight) * rnd->camera->pos.y);
		pixel.y = i;
		draw_floor_pixel(rnd, ray, &pixel, &p_tex, light);
		pixel.y = rnd->w->size.y - i++;
		draw_sky_pixel(rnd, ray, &pixel, &p_tex, light);
	}
}

/* ************************************************************************** */
// 床/天井内挿の基準点 floor_wall を求める。これは壁の足元に当たるワールド座標で、衝突面
// (side)と光線の向き(符号)の4通りに応じて、当たったマスのどの辺＋wall_x の位置かを決める
static void
	init_draw_sky_floor(t_ray* ray)
{
	if (ray->side == 0 && ray->ray_dir.x > 0) {
		set_pos(&ray->floor_wall, ray->map_pos.x, ray->map_pos.y + ray->wall_x);
	} else if (ray->side == 0 && ray->ray_dir.x < 0) {
		set_pos(&ray->floor_wall, ray->map_pos.x + 1., ray->map_pos.y + ray->wall_x);
	} else if (ray->side && ray->ray_dir.y > 0) {
		set_pos(&ray->floor_wall, ray->map_pos.x + ray->wall_x, ray->map_pos.y);
	} else if (ray->side && ray->ray_dir.y < 0) {
		set_pos(&ray->floor_wall, ray->map_pos.x + ray->wall_x, ray->map_pos.y + 1.);
	}
}

/* ************************************************************************** */
// 床の1ピクセルを描く。テクスチャがあれば床ワールド座標をテクセルへ写してサンプリングし、
// 無ければ床色を使う。いずれも距離暗化＋フラッシュライト補正をかけ、最後に装飾スプライトの
// スポットライトで輝度を底上げする。& (width-1) はテクスチャ寸法が2の冪である前提で、
// 剰余(%)による折り返しをビット論理積で高速化したもの
static void
	draw_floor_pixel(t_render* rnd, t_ray* ray, t_pos* pixel, t_pos* p_tex, double light)
{
	t_tex*	tex;
	int		color;
	double	spot;

	spot = spotlight_factor(rnd->world, ray->c_floor.x, ray->c_floor.y);
	tex = &rnd->tex[TEX_FLOOR];
	if (!tex->tex) {
		color = distance_shade(rnd->options, rnd->config->colors[TEX_FLOOR], rnd->sf_dist[ray->row], light);
	} else {
		set_pos(p_tex,
			((int)(ray->c_floor.x * tex->width)) & (tex->width - 1),
			((int)(ray->c_floor.y * tex->height)) & (tex->height - 1));
		color = distance_shade(rnd->options, get_tex_color(tex, p_tex), rnd->sf_dist[ray->row], light);
	}
	draw_pixel(rnd->w, pixel, apply_spotlight(color, spot));
}

/* ************************************************************************** */
// 天井(空)の1ピクセルを描く。床と同様にテクスチャ有無で分岐し、ある場合は同じ c_floor 座標を
// 2の冪前提の & (width-1) でテクセルへ折り返してサンプリングする（天井はスポットライト対象外）
static void
	draw_sky_pixel(t_render* rnd, t_ray* ray, t_pos* pixel, t_pos* p_tex, double light)
{
	t_tex*	tex;

	tex = &rnd->tex[TEX_SKY];
	if (!tex->tex) {
		draw_pixel(rnd->w, pixel, distance_shade(rnd->options, rnd->config->colors[TEX_SKY], rnd->sf_dist[ray->row], light));
	} else {
		set_pos(p_tex,
			((int)(ray->c_floor.x * tex->width)) & (tex->width - 1),
			((int)(ray->c_floor.y * tex->height)) & (tex->height - 1));
		draw_pixel(rnd->w, pixel, distance_shade(rnd->options, get_tex_color(tex, p_tex), rnd->sf_dist[ray->row], light));
	}
}
