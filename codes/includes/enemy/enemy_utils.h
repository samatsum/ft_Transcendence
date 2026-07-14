#ifndef ENEMY_UTILS_H
# define ENEMY_UTILS_H

/* ************************************************************************** */
# include "core/core.h"

/* ************************************************************************** */
// 円周率。8方向テクスチャの算出と視野角(FOV)の正規化で複数ファイルが共有する
# define M_PI	3.14159265358979323846

/* ************************************************************************** */
int
	enemy_sees_player(t_enemy* cur, t_game* game, double target_angle);
void
	update_texture(t_enemy* cur, t_game* game, double target_angle);
int
	bfs_fill_path(t_config* config, int sx, int sy, int gx, int gy, t_pos* path);
int
	bfs_to_nearest_patrol(t_config* config, int sx, int sy, t_pos* next);
void
	step_enemy(t_enemy* cur, t_game* game, double delta_time, double speed_mult);
void
	patrol_enemy(t_enemy* cur, t_game* game, double delta_time, double speed_scale);
void
	update_fps_enemy(t_enemy* cur, t_game* game, double delta_time);
void
	update_rsp_enemy(t_enemy* cur, t_game* game, double delta_time);
double
	wrap_pi(double angle);

#endif
