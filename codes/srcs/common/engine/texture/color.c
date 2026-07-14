#include "core/core.h"
#include "engine/texture/texture.h"
#include "tuning.h"

/* ************************************************************************** */

int
	shade_color(int color, double divide);
int
	distance_shade(int options, int color, double distance, double light);
int
	get_tex_color(t_tex* tex, t_pos* pos);
double
	flashlight_divide(double divide, double distance, double light);

/* ************************************************************************** */

// 指定された割合で色を暗くする
int
	shade_color(int color, double divide)
{
	if (divide <= 1.) {
		return (color);
	}
	//RGBの成分を取り出すためのビットシフト
	return (((int)(((0xFF0000 & color) >> 16) / divide) << 16) + ((int)(((0x00FF00 & color) >> 8) / divide) << 8) + ((int)((0x0000FF & color) / divide)));
}

/* ************************************************************************** */

// 距離で暗くし、ライト点灯かつ正面コーン内(light>0)の近距離だけ暗化を打ち消す
int
	distance_shade(int options, int color, double distance, double light)
{
	double	divide;

	divide = 1.0;
	if (options & FLAG_SHADOWS) {
		divide = distance / 1.5;
	}
	if (options & FLAG_FLASHLIGHT) {
		divide = flashlight_divide(divide, distance, light);
	}
	return (shade_color(color, divide));
}

/* ************************************************************************** */

// テクスチャの指定された座標から色を取得する
int
	get_tex_color(t_tex* tex, t_pos* pos)
{
	if (pos->x >= 0 && pos->x < tex->width && pos->y >= 0 && pos->y < tex->height) {
		return (*(int*)(tex->ptr + (BYTES_PER_PIXEL * tex->width * (int)pos->y) + (BYTES_PER_PIXEL * (int)pos->x)));
	}
	return (0x0);
}

/* ************************************************************************** */

// コーン内かつ近距離ほど暗化の割り算を1.0へ寄せる（light:角度重み, 0で無効）
double
	flashlight_divide(double divide, double distance, double light)
{
	double	weight;

	if (light <= 0.0 || distance >= LIGHT_RANGE) {
		return (divide);
	}
	weight = (1.0 - distance / LIGHT_RANGE) * light;
	return (divide - (divide - 1.0) * weight * LIGHT_BOOST);
}
