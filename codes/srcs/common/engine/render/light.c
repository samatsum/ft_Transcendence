#include <math.h>              /* hypot, atan, fabs (flashlight_weight) 用 */
#include <stdlib.h>            /* malloc, free 用 */

#include "config/config.h"     /* IS_PASSABLE / IS_SPAWN 等のマクロ展開のため */
#include "types.h"             /* t_light / t_world 定義のため */
#include "engine/render/light.h"
#include "tuning.h"            /* SPOT_RADIUS, SPOT_GAIN 用 */

/* ************************************************************************** */
int
	build_lights(struct s_world* world, struct s_config* config);
void
	clear_lights(struct s_world* world);
double
	spotlight_factor(struct s_world* world, double wx, double wy);
int
	apply_spotlight(int color, double factor);
static int
	count_passable(struct s_config* config);
static void
	fill_lights(t_light* lights, struct s_config* config);
static int
	clamp_255(int v);
double
	spotlight_shade(double divide, double factor);
double
	flashlight_weight(t_render* rnd, int column);

/* ************************************************************************** */
// 装飾スプライト(通行可オブジェクト)とスポーンマーカーのマス中心を光源とする配列を確保し、
// 中身を fill_lights で書き込む。光源が0個なら確保せず成功(1)を返す。malloc 失敗時のみ 0
int
	build_lights(struct s_world* world, struct s_config* config)
{
	int	count;

	world->lights = NULL;
	world->light_count = 0;
	count = count_passable(config);
	if (count <= 0) {
		return (1);
	}
	world->lights = (t_light*)malloc(sizeof(t_light) * count);
	if (!world->lights) {
		return (0);
	}
	world->light_count = count;
	fill_lights(world->lights, config);
	return (1);
}

/* ************************************************************************** */
// 光源配列を解放する。二重解放を防ぐためポインタを NULL、個数を 0 に戻しておく
void
	clear_lights(struct s_world* world)
{
	if (world->lights) {
		free(world->lights);
	}
	world->lights = NULL;
	world->light_count = 0;
}

/* ************************************************************************** */
// ワールド座標(wx,wy)に最も強く届く光源の照度係数[0,1]を返す。各光源との二乗距離 d2 が
// 半径二乗 r2 未満なら届くとみなし、(1 - d2/r2)^2 の二乗減衰で強度を出す。距離は二乗のまま
// 比較するので sqrt は不要。複数光源では最大値を採用する
double
	spotlight_factor(struct s_world* world, double wx, double wy)
{
	double	r2;
	double	d2;
	double	f;
	double	best;
	int		i;

	best = 0.0;
	r2 = SPOT_RADIUS * SPOT_RADIUS;
	i = 0;
	while (i < world->light_count) {
		d2 = (wx - world->lights[i].pos.x) * (wx - world->lights[i].pos.x)
			+ (wy - world->lights[i].pos.y) * (wy - world->lights[i].pos.y);
		if (d2 < r2) {
			f = 1.0 - d2 / r2;
			f = f * f;
			if (f > best) {
				best = f;
			}
		}
		i++;
	}
	return (best);
}

/* ************************************************************************** */
// 照度係数 factor に応じて色を乗算で明るくする。factor<=0 なら素通り。R/G/B を同じゲイン
// (1 + factor*SPOT_GAIN)で一律に持ち上げるため、色相・彩度を保ったまま輝度だけ上がる。
// 各成分は clamp_255 で飽和させる
int
	apply_spotlight(int color, double factor)
{
	double	gain;
	int		r;
	int		g;
	int		b;

	if (factor <= 0.0) {
		return (color);
	}
	gain = 1.0 + factor * SPOT_GAIN;
	r = clamp_255((int)(((color >> 16) & 0xFF) * gain));
	g = clamp_255((int)(((color >> 8) & 0xFF) * gain));
	b = clamp_255((int)((color & 0xFF) * gain));
	return ((r << 16) | (g << 8) | b);
}

/* ************************************************************************** */
// マップ全体を走査し、通行可オブジェクトとスポーンマーカーのマス数(＝光源数)を数える。
// build_lights が確保する配列サイズを決めるための事前カウント
static int
	count_passable(struct s_config* config)
{
	int	i;
	int	j;
	int	count;

	count = 0;
	i = 0;
	while (i < config->map.rows) {
		j = 0;
		while (j < config->map.columns) {
			if (IS_PASSABLE(config->map.data[i * config->map.columns + j])
				|| IS_SPAWN(config->map.data[i * config->map.columns + j])) {
				count++;
			}
			j++;
		}
		i++;
	}
	return (count);
}

/* ************************************************************************** */
// count_passable と同じ条件でマップを走査し、該当マスの中心(+0.5)を各光源の座標へ書き込む。
// 走査順が count_passable と一致するので、確保済み配列を添字 k で順に埋めれば過不足なく収まる
static void
	fill_lights(t_light* lights, struct s_config* config)
{
	int	i;
	int	j;
	int	k;

	k = 0;
	i = 0;
	while (i < config->map.rows) {
		j = 0;
		while (j < config->map.columns) {
			if (IS_PASSABLE(config->map.data[i * config->map.columns + j])
				|| IS_SPAWN(config->map.data[i * config->map.columns + j])) {
				set_pos(&lights[k].pos, j + 0.5, i + 0.5);
				k++;
			}
			j++;
		}
		i++;
	}
}

/* ************************************************************************** */
// 色成分を 0〜255 に収める。乗算で 255 を超えた分を頭打ちにし、自然に白へ寄せる
static int
	clamp_255(int v)
{
	if (v > 255) {
		return (255);
	}
	return (v);
}

/* ************************************************************************** */
// 距離暗化の除算係数 divide を、光だまりの強さ factor に応じて 1.0(=フル輝度)側へ引き戻す。
// factor<=0 や元から明るい(divide<=1)場合はそのまま。暗い床/天井が光源近傍で黒潰れするのを防ぐ
double
	spotlight_shade(double divide, double factor)
{
	double	out;

	if (factor <= 0.0 || divide <= 1.0) {
		return (divide);
	}
	out = divide - (divide - 1.0) * factor;
	if (out < 1.0) {
		out = 1.0;
	}
	return (out);
}

/* ************************************************************************** */
// 懐中電灯のコーン内での列の重みを返す。列のレイ角が正面±LIGHT_CONE_DEG度以内なら、中心で
// 1.0・端で 0 へ線形に落ちる値。コーン外や懐中電灯OFFなら 0。角度は plane/dir のベクトル長から
// atan で求め、LIGHT_CONE_DEG をラジアンへ換算した limit と比較する
double
	flashlight_weight(t_render* rnd, int column)
{
	double	camera_x;
	double	plane_len;
	double	dir_len;
	double	angle;
	double	limit;

	if (!(rnd->options & FLAG_FLASHLIGHT)) {
		return (0.0);
	}
	camera_x = 2.0 * column / rnd->w->size.x - 1.0;
	plane_len = hypot(rnd->camera->plane.x, rnd->camera->plane.y);
	dir_len = hypot(rnd->camera->dir.x, rnd->camera->dir.y);
	angle = atan(fabs(camera_x) * plane_len / dir_len);
	limit = LIGHT_CONE_DEG * (M_PI / 180.0);
	if (angle >= limit) {
		return (0.0);
	}
	return (1.0 - angle / limit);
}
