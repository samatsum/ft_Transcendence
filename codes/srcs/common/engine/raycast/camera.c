#include <math.h>              /* cos, sin 用 */

#include "engine/raycast/raycast.h"
#include "core/core.h"         /* t_game（player 戦闘員・config・world 参照）のため */
#include "core/collision.h"    /* combatant_walk_axis 用 */

/* ************************************************************************** */
int
	move_camera(t_game* game, int direction, double time_mult);
int
	move_perp_camera(t_game* game, int direction, double time_mult);
int
	rotate_camera(t_camera* cam, t_config* config, int dir, double time_mult);
static void
	mark_visited(t_camera* cam, t_config* config);

/* ************************************************************************** */
// 前後へ移動する。視線方向 dir に速度×時間倍率(time_mult でFPS非依存にする)を掛けた移動量を
// x 軸ぶん・y 軸ぶんに分けて共有の combatant_walk_axis へ渡す。軸ごとに判定することで、
// 片方が壁でももう片方には滑り込める「壁ずり」移動になる。direction が非0なら後退。
// 自分の戦闘員 sprite を ignore に渡し、リスト内の自分自身とは衝突しない
int
	move_camera(t_game* game, int direction, double time_mult)
{
	t_camera*	cam;
	t_pos		mv;
	double		actual_speed;

	cam = &game->camera;
	actual_speed = game->config.move_speed * time_mult;
	if (direction) {
		actual_speed = -actual_speed;
	}
	set_pos(&mv, cam->dir.x * actual_speed, 0.0);
	combatant_walk_axis(game, game->player->sprite, &cam->pos, mv);
	set_pos(&mv, 0.0, cam->dir.y * actual_speed);
	combatant_walk_axis(game, game->player->sprite, &cam->pos, mv);
	mark_visited(cam, &game->config);
	return (1);
}

/* ************************************************************************** */
// 左右へ平行移動(ストレイフ)する。dir の代わりに直交ベクトル x_dir を使う以外は
// move_camera と同じで、軸分割の壁ずり・時間倍率・訪問済みマーキングも同様に行う
int
	move_perp_camera(t_game* game, int direction, double time_mult)
{
	t_camera*	cam;
	t_pos		mv;
	double		actual_speed;

	cam = &game->camera;
	actual_speed = game->config.move_speed * time_mult;
	if (direction) {
		actual_speed = -actual_speed;
	}
	set_pos(&mv, cam->x_dir.x * actual_speed, 0.0);
	combatant_walk_axis(game, game->player->sprite, &cam->pos, mv);
	set_pos(&mv, 0.0, cam->x_dir.y * actual_speed);
	combatant_walk_axis(game, game->player->sprite, &cam->pos, mv);
	mark_visited(cam, &game->config);
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
// 移動後、足元のマスが収集物・ゴール・スポーン文字(N/S/E/W)でなければ訪問済み
// マーカー 'A' を書き込む（属性層 map.flags は壊さない）
static void
	mark_visited(t_camera* cam, t_config* config)
{
	if (!IS_COLLECTIBLE(MAP(cam->pos, *config)) && !IS_GOAL(MAP(cam->pos, *config))
		&& !ft_in_set(MAP(cam->pos, *config), DIRECTIONS)) {
		MAP(cam->pos, *config) = 'A';
	}
}
