#include <math.h>              /* cos, sin 用 */
#include <stddef.h>            /* NULL 用 */

#include "engine/raycast/raycast.h"
#include "config/config.h"     /* IN_MAP / MAP / IS_BLOCKING 等のマクロ展開のため */
#include "core/collision.h"    /* is_blocked_by_enemies 用 */
#include "tuning.h"            /* WALL_MARGIN 用 */

/* ************************************************************************** */
int
	move_camera(t_camera* cam, t_config* config, struct s_world* world, int direction, double time_mult);
int
	move_perp_camera(t_camera* cam, t_config* config, struct s_world* world, int direction, double time_mult);
int
	rotate_camera(t_camera* cam, t_config* config, int dir, double time_mult);
static void
	walk_axis(t_camera* cam, t_config* config, struct s_world* world, t_pos mv);

/* ************************************************************************** */
// 前後へ移動する。視線方向 dir に速度×時間倍率(time_mult でFPS非依存にする)を掛けた移動量を
// x 軸ぶん・y 軸ぶんに分けて walk_axis へ渡す。軸ごとに判定することで、片方が壁でも
// もう片方には滑り込める「壁ずり」移動になる。direction が非0なら後退。移動後、足元のマスが
// 収集物でもスポーン文字(N/S/E/W)でもなければ訪問済みマーカー 'A' を書き込む（属性層は壊さない）
int
	move_camera(t_camera* cam, t_config* config, struct s_world* world, int direction, double time_mult)
{
	t_pos	mv;
	double	actual_speed;

	actual_speed = config->move_speed * time_mult;
	if (direction) {
		actual_speed = -actual_speed;
	}
	set_pos(&mv, cam->dir.x * actual_speed, 0.0);
	walk_axis(cam, config, world, mv);
	set_pos(&mv, 0.0, cam->dir.y * actual_speed);
	walk_axis(cam, config, world, mv);
	if (!IS_COLLECTIBLE(MAP(cam->pos, *config)) && !IS_GOAL(MAP(cam->pos, *config))
		&& !ft_in_set(MAP(cam->pos, *config), DIRECTIONS)) {
		MAP(cam->pos, *config) = 'A';
	}
	return (1);
}

/* ************************************************************************** */
// 左右へ平行移動(ストレイフ)する。dir の代わりに直交ベクトル x_dir を使う以外は
// move_camera と同じで、軸分割の壁ずり・時間倍率・訪問済みマーキングも同様に行う
int
	move_perp_camera(t_camera* cam, t_config* config, struct s_world* world, int direction, double time_mult)
{
	t_pos	mv;
	double	actual_speed;

	actual_speed = config->move_speed * time_mult;
	if (direction) {
		actual_speed = -actual_speed;
	}
	set_pos(&mv, cam->x_dir.x * actual_speed, 0.0);
	walk_axis(cam, config, world, mv);
	set_pos(&mv, 0.0, cam->x_dir.y * actual_speed);
	walk_axis(cam, config, world, mv);
	if (!IS_COLLECTIBLE(MAP(cam->pos, *config)) && !IS_GOAL(MAP(cam->pos, *config))
		&& !ft_in_set(MAP(cam->pos, *config), DIRECTIONS)) {
		MAP(cam->pos, *config) = 'A';
	}
	return (1);
}

/* ************************************************************************** */
// カメラの視線を回転させ、方向 dir・カメラ平面 plane・直交ベクトル x_dir を一括で回す。
// 回転角は rotate_speed×time_mult で、dir==0 のときは逆回り(負角)。可変FPSに追従するため
// 毎フレーム cos/sin を計算し、各ベクトルへ2次元回転行列を適用する。回転前の x 成分を old に
// 退避してから更新するのは、x を先に書き換えると y の計算が壊れるため
int
	rotate_camera(t_camera* cam, t_config* config, int dir, double time_mult)
{
	t_pos	old;
	double	actual_rot;
	double	cos_val;
	double	sin_val;

	actual_rot = config->rotate_speed * time_mult;
	if (dir == 0) {
		actual_rot = -actual_rot;
	}
	cos_val = cos(actual_rot);
	sin_val = sin(actual_rot);
	copy_pos(&old, &cam->dir);
	cam->dir.x = (cam->dir.x * cos_val) - (cam->dir.y * sin_val);
	cam->dir.y = (old.x * sin_val) + (cam->dir.y * cos_val);
	copy_pos(&old, &cam->plane);
	cam->plane.x = (cam->plane.x * cos_val) - (cam->plane.y * sin_val);
	cam->plane.y = (old.x * sin_val) + (cam->plane.y * cos_val);
	copy_pos(&old, &cam->x_dir);
	cam->x_dir.x = (cam->x_dir.x * cos_val) - (cam->x_dir.y * sin_val);
	cam->x_dir.y = (old.x * sin_val) + (cam->x_dir.y * cos_val);
	return (1);
}

/* ************************************************************************** */
// cam を mv 方向(片軸ぶん。もう片方は0)へ動かす試み。移動先 next だけでなく、進行方向へ
// WALL_MARGIN ぶん踏み込んだ probe も先読みし、両マスとも「マップ内・非ブロッキング」で
// かつ敵にも阻まれない場合だけ確定する。(mv>0)-(mv<0) は移動量の符号(±1/0)抽出で、
// 壁の手前 WALL_MARGIN で止めることで壁への食い込みを防ぐ
static void
	walk_axis(t_camera* cam, t_config* config, struct s_world* world, t_pos mv)
{
	t_pos	next;
	t_pos	probe;

	copy_pos(&next, &cam->pos);
	next.x += mv.x;
	next.y += mv.y;
	set_pos(&probe, next.x + WALL_MARGIN * ((mv.x > 0.0) - (mv.x < 0.0)),
		next.y + WALL_MARGIN * ((mv.y > 0.0) - (mv.y < 0.0)));
	if (IN_MAP(next, *config) && !IS_BLOCKING(MAP(next, *config))
		&& IN_MAP(probe, *config) && !IS_BLOCKING(MAP(probe, *config))
		&& !is_blocked_by_enemies(&cam->pos, &next, world, NULL)) {
		copy_pos(&cam->pos, &next);
	}
}
