#include "engine/render/render.h"  /* 自身の関数宣言・draw_pixel・MAX のため */

/* ************************************************************************** */
int
	draw_vertical_line(t_window* window, t_pos* start, int length, int color);
int
	draw_rectangle(t_window* window, t_pos* p1, t_pos* p2, int color);
static void
	restrain_pos(t_pos* pos, t_pos* size);

/* ************************************************************************** */
// start から下方向へ length ピクセルの縦線を引く。テクスチャ未指定の壁を単色で塗るのに使う。
// 列 x が画面外なら何もせず、y は画面下端(limit)で打ち切るので画面外へはみ出さない
int
	draw_vertical_line(t_window* window, t_pos* start, int length, int color)
{
	t_pos	pos;
	int		limit;
	int		i;
	int		j;

	if (start->x < 0 || start->x > window->size.x) {
		return (1);
	}
	pos.x = start->x;
	limit = (int)window->size.y;
	i = 0;
	while (i < length && (j = start->y + i) < limit) {
		pos.y = j;
		draw_pixel(window, &pos, color);
		i++;
	}
	return (1);
}

/* ************************************************************************** */
// 2点 p1(左上)・p2(右下)で囲む矩形を単色で塗りつぶす。各点を画面内へ丸めてから走査するので
// 範囲外指定でも安全。毎フレーム先頭で画面全体を黒で消去する用途にも使う
int
	draw_rectangle(t_window* window, t_pos* p1, t_pos* p2, int color)
{
	t_pos	pos;
	int		i;
	int		j;

	restrain_pos(p1, &window->size);
	restrain_pos(p2, &window->size);
	i = p1->y;
	while (i < p2->y) {
		pos.y = i;
		j = p1->x;
		while (j < p2->x) {
			pos.x = j++;
			draw_pixel(window, &pos, color);
		}
		i++;
	}
	return (1);
}

/* ************************************************************************** */
// 座標を画面内 [0, size) に収まるよう丸める。負値は 0、画面サイズ以上は size-1 にクランプし、
// draw_rectangle が画面外の領域を走査しないようにする
static void
	restrain_pos(t_pos* pos, t_pos* size)
{
	if (pos->x < 0) {
		pos->x = 0;
	}
	if (pos->x > size->x) {
		pos->x = size->x - 1;
	}
	if (pos->y < 0) {
		pos->y = 0;
	}
	if (pos->y > size->y) {
		pos->y = size->y - 1;
	}
}
