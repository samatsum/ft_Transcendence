#ifndef LIGHT_H
# define LIGHT_H

# include "utils/utils.h"

/* ************************************************************************** */
// ポインタでのみ参照する構造体の前方宣言（循環インクルード回避のため）
struct s_world;
struct s_config;

/* ************************************************************************** */
// 装飾スプライト1個が放つ点光源。半径・強度は全光源で共通(tuning.h)のため、
// ここではマス中心のワールド座標だけを保持する
typedef struct s_light
{
	t_pos	pos;
}			t_light;

/* ************************************************************************** */
// 装飾スプライトから光源配列を構築/破棄し、任意点の照度係数と色適用を提供する
int
	build_lights(struct s_world* world, struct s_config* config);
void
	clear_lights(struct s_world* world);
double
	spotlight_factor(struct s_world* world, double wx, double wy);
int
	apply_spotlight(int color, double factor);
double
	spotlight_shade(double divide, double factor);
    
#endif
