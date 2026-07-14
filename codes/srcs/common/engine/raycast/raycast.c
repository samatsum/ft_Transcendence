#include <math.h>              /* fabs 用 */

#include "engine/raycast/raycast.h"
#include "config/config.h"     /* IN_MAP / MAP / IS_DOOR 等のマクロ展開のため */

/* ************************************************************************** */
void
	ray_cast(t_camera* camera, t_config* config, t_ray* ray, double cam_x);
static int
	wall_direction(t_ray* ray);
static double
	ray_distance(t_camera* camera, t_ray* ray);
static void
	init_ray(t_ray* ray, t_camera* camera, double camera_x);

/* ************************************************************************** */
// 画面1列ぶんの光線をカメラから飛ばし、最初にぶつかった壁/扉までの情報を ray に求める。
// 本体は DDA(Digital Differential Analyzer)法：init_ray で1マス進むごとの移動量を用意し、
// 「次のマス境界が近い軸」へ1マスずつ交互に進めて格子線との交点だけを辿る。side は
// 直近に踏み越えた境界が縦線(side=0:東西面)か横線(side=1:南北面)かを表し、テクスチャ面の
// 判定に使う。マップ外へ出た場合は踏み出した1マスぶん戻して境界の壁セルを指すよう補正し、
// 壁('1')・扉のいずれかに当たった時点でループを抜けて距離と面方向を確定する
void
	ray_cast(t_camera* camera, t_config* config, t_ray* ray, double cam_x)
{
	int	hit;
	int	next_side;

	copy_pos(&ray->ray_pos, &camera->pos);
	init_ray(ray, camera, cam_x);
	hit = 0;
	ray->is_door = 0;
	while (!hit) {
		next_side = (ray->side_dist.x < ray->side_dist.y);
		ray->side_dist.x += ((next_side) ? ray->delta_dist.x : 0.);
		ray->map_pos.x += ((next_side) ? ray->step.x : 0.);
		ray->side_dist.y += ((!next_side) ? ray->delta_dist.y : 0.);
		ray->map_pos.y += ((!next_side) ? ray->step.y : 0.);
		ray->side = !next_side;
		if (!IN_MAP(ray->map_pos, *config)) {
			ray->map_pos.x -= ((!ray->side) ? ray->step.x : 0.);
			ray->map_pos.y -= ((ray->side) ? ray->step.y : 0.);
			hit = 1;
		} else if (MAP(ray->map_pos, *config) == '1') {
			hit = 1;
		} else if (IS_DOOR(MAP(ray->map_pos, *config))) {
			ray->is_door = 1;
			hit = 1;
		}
	}
	ray->distance = ray_distance(camera, ray);
	ray->direction = wall_direction(ray);
}

/* ************************************************************************** */
// 衝突した壁の面に対応するテクスチャ方向を返す。side=1(横線=南北面)なら光線の y 成分の
// 符号で北/南を、side=0(縦線=東西面)なら x 成分の符号で西/東を選ぶ
static int
	wall_direction(t_ray* ray)
{
	if (ray->side) {
		return ((ray->ray_dir.y < 0) ? (TEX_NORTH) : (TEX_SOUTH));
	}
	return ((ray->ray_dir.x < 0) ? (TEX_WEST) : (TEX_EAST));
}

/* ************************************************************************** */
// プレイヤーから壁までの「カメラ平面に垂直な」距離を返す。視線方向そのままの距離だと
// 画面端ほど引き伸ばされる魚眼歪みが出るため、踏み越えた境界軸に沿った成分のみで距離を
// 求めて補正する。(1 - step)/2 は踏み込んだマスのどちら側の面に当たったかの位置合わせ
static double
	ray_distance(t_camera* camera, t_ray* ray)
{
	double	pos;

	if (ray->side) {
		pos = (ray->map_pos.y - camera->pos.y + (1. - ray->step.y) / 2.);
		return (fabs(pos / ray->ray_dir.y));
	}
	pos = (ray->map_pos.x - camera->pos.x + (1. - ray->step.x) / 2.);
	return (fabs(pos / ray->ray_dir.x));
}

/* ************************************************************************** */
// DDA の初期状態を組み立てる。map_pos はカメラのいる整数マス、ray_dir は視線方向 dir に
// カメラ平面 plane を camera_x(画面横位置を-1..1へ正規化した値)ぶん足した光線方向。
// delta_dist は1マス分 x/y を跨ぐのに必要な光線長。step は各軸の進行符号(±1)で、
// side_dist は現在地から最初のマス境界までの距離。ray_dir の符号で、左/上向きなら
// 「現在地 - マス境界」、右/下向きなら「次のマス境界 - 現在地」と起点が変わる
static void
	init_ray(t_ray* ray, t_camera* camera, double camera_x)
{
	set_pos(&ray->map_pos, (int)camera->pos.x, (int)camera->pos.y);
	set_pos(&ray->ray_dir, camera->dir.x + camera->plane.x * camera_x, camera->dir.y + camera->plane.y * camera_x);
	set_pos(&ray->delta_dist, fabs(1. / ray->ray_dir.x), fabs(1. / ray->ray_dir.y));
	if (ray->ray_dir.x < 0.) {
		set_pos(&ray->step, -1., (ray->ray_dir.y < 0.) ? -1. : 1.);
		ray->side_dist.x = (ray->ray_pos.x - ray->map_pos.x) * ray->delta_dist.x;
	} else {
		set_pos(&ray->step, 1., (ray->ray_dir.y < 0.) ? -1. : 1.);
		ray->side_dist.x = (ray->map_pos.x + 1. - ray->ray_pos.x) * ray->delta_dist.x;
	}
	if (ray->ray_dir.y < 0.) {
		ray->side_dist.y = (ray->ray_pos.y - ray->map_pos.y) * ray->delta_dist.y;
	} else {
		ray->side_dist.y = (ray->map_pos.y + 1. - ray->ray_pos.y) * ray->delta_dist.y;
	}
}
