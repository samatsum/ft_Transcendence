#ifndef RAYCAST_H
# define RAYCAST_H

# include "utils/utils.h"
# include "config/config.h"

/* ************************************************************************** */
typedef struct s_camera
{
	t_pos		pos;
	t_pos		dir;
	t_pos		x_dir;
	t_pos		plane;
}				t_camera;

typedef struct s_ray
{
	int			column;
	int			row;
	double		distance;
	int			direction;
	int			side;
	int			is_door;
	int			height;
	t_pos		ray_pos;
	t_pos		ray_dir;
	t_pos		map_pos;
	t_pos		side_dist;
	t_pos		delta_dist;
	t_pos		step;
	double		wall_x;
	t_pos		floor_wall;
	t_pos		c_floor;
}				t_ray;

struct s_config;
struct s_game;
struct s_world;

/* ************************************************************************** */
void
	collect_spawns(t_config* config);
void
	apply_spawn(t_config* config, t_camera* camera, t_spawn_point* sp);
int
	pick_spawn_index(t_config* config, const char* allowed, unsigned int* seed);
int
	pick_spawn_indices(t_config* config, const char* allowed, unsigned int* seed, int* out, int want);
int
	move_camera(struct s_game* game, int direction, double time_mult);
int
	move_perp_camera(struct s_game* game, int direction, double time_mult);
int
	rotate_camera(t_camera* cam, struct s_config* config, int dir, double time_mult);
void
	ray_cast(t_camera* camera, struct s_config* config, t_ray* ray, double cam_x);
int
	spawn_marker_slot(char c);
	
#endif
