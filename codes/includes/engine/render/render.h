#ifndef RENDER_H
# define RENDER_H

# include "engine/raycast/raycast.h"
# include "engine/texture/texture.h"
# include "utils/utils.h"

/* ************************************************************************** */
// 構造体の前方宣言
struct	s_config;
struct	s_game;
struct	s_world;

/* ************************************************************************** */
// 画像のデータと属性を管理する構造体
typedef struct s_image
{
	void*	img;
	void*	ptr;
	int		bpp;
	int		size_line;
	int		endian;
}	t_image;

// ウィンドウの情報と画面描画用バッファを管理する構造体
typedef struct s_window
{
	void*	ptr;
	void*	win;
	t_image	screen;
	t_pos	size;
	t_pos	half;
	double	ratio;
}	t_window;

// スプライト描画計算用の中間データを保持する構造体
typedef struct s_sprite_draw
{
	int		sprite_screen;
	t_pos	transform;
	t_pos	spr_s;
	t_pos	draw_x;
	t_pos	draw_y;
	int		draw_y_org;
}	t_sprite_draw;

// マップ上に配置されたスプライト（アイテムや敵など）を管理するリスト構造体
typedef struct s_sprite
{
	t_pos				pos;
	double				distance;
	t_tex*				tex;
	struct s_sprite*	next;
	struct s_sprite*	sorted;
}	t_sprite;

// レンダリングに必要な全体情報をまとめて管理する構造体
typedef struct s_render
{
	t_window*			w;
	struct s_config*	config;
	t_camera*			camera;
	struct s_world*		world;
	t_tex*				tex;
	t_tex*				door_tex;
	double*				depth;
	double*				sf_dist;
	int					options;
	int					mode;
}	t_render;

// 列データ並列の作業単位。各ワーカーが担当する列範囲[start,end)を保持する。
// rnd は読み取り専用で共有し、書き込み先（画面の各列・depth[]）はスレッド間で
// 重複しないため、ミューテックスなしで安全に並列実行できる
typedef struct s_render_job
{
	t_render*	rnd;
	double*		camera_x;
	int			start;
	int			end;
}	t_render_job;

/* ************************************************************************** */
// 呼び出し元でインライン展開。関数呼び出しのオーバーヘッドが消滅
static inline void
	draw_pixel(t_window* w, t_pos* pos, int color)
{
	unsigned int*	dst;

	if (pos->x >= 0 && pos->x < w->size.x && pos->y >= 0 && pos->y < w->size.y) {
		dst = (unsigned int*)w->screen.ptr;
		dst[(int)pos->y * (w->screen.size_line / 4) + (int)pos->x] = (unsigned int)color;
	}
}

/* ************************************************************************** */
void
	render_frame(struct s_game* game);
void
	cast_columns(t_render* rnd, double* camera_x);
void
	make_tables(struct s_game* game);
void
	draw_weapon(struct s_game* game);
void
	draw_overlay(struct s_game* game, t_tex* tex, double start_x, double start_y, double scale);
void
	render_fps_weapon(struct s_game* game);
void
	render_rsp_hand(struct s_game* game);
int
	draw_vertical_line(t_window* window, t_pos* start, int length, int color);
int
	draw_rectangle(t_window* window, t_pos* p1, t_pos* p2, int color);
void
	draw_wall(t_render* rnd, t_ray* ray);
void
	draw_sky_floor(t_render* rnd, t_ray* ray);
t_sprite*
	add_front_sprite(t_sprite** sprites, double distance, t_pos* pos, t_tex* tex);
t_sprite*
	sort_sprites(t_camera* camera, t_sprite* sprites);
void
	delete_sprite(t_sprite** sprites, t_pos* pos);
void
	delete_sprite_node(t_sprite** sprites, t_sprite* target);
void
	draw_sprites(t_render* rnd, t_sprite* sprites);
void
	clear_sprites(t_sprite** sprites);
void
	sprite_transform(t_camera* camera, double inv_det, t_pos world, t_pos* out);
double
	flashlight_weight(t_render* rnd, int column);

#endif
