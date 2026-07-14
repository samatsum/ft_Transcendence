#include "core/core.h"                 /* t_game 定義のため */
#include "engine/render/render.h"      /* make_tables プロトタイプ・t_render_cache のため */

/* ************************************************************************** */
void
	make_tables(t_game* game);
static void
	calculate_camera_x(double width, double* r);
static void
	calculate_sf_dist(double height, double* r);

/* ************************************************************************** */
// 描画の毎フレーム計算のうち、画面サイズだけで決まり変化しない値を起動時に一度だけ
// テーブル化してキャッシュへ格納する。列ごとのカメラ平面比率と、行ごとの床/天井距離比率を
// 先に作っておくことで、ホットパスのレンダリングループから割り算を追い出して高速化する
void
	make_tables(t_game* game)
{
	calculate_camera_x(game->window.size.x, game->cache.camera_x);
	calculate_sf_dist(game->window.size.y, game->cache.sf_dist);
}

/* ************************************************************************** */
// 各画面列 i のカメラ平面比率 camera_x を事前計算する。画面左端を -1、右端を +1 へ
// 正規化した値 (2*i/width) - 1 で、レイ方向 dir + plane*camera_x の係数として使う
static void
	calculate_camera_x(double width, double* r)
{
	int	i;

	i = 0;
	while (i < width) {
		r[i] = ((2. * (double)i) / width) - 1.;
		i++;
	}
}

/* ************************************************************************** */
// 各画面行 i の床/天井距離比率 sf_dist を事前計算する。height/(2*i - height) は地平線
// (画面中央)からの行オフセットを実距離へ写す係数で、床と天井のテクスチャ投影に使う
static void
	calculate_sf_dist(double height, double* r)
{
	int	i;

	i = 0;
	while (i < height) {
		r[i] = (height / (2. * (double)i - height));
		i++;
	}
}
