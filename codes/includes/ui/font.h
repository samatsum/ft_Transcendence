#ifndef UI_FONT_H
# define UI_FONT_H

# include "engine/render/render.h"

/* ************************************************************************** */
// 8x8 ビットマップフォントの寸法と収録範囲（印字可能ASCII 0x20..0x7E）
# define FONT_W			8
# define FONT_H			8
# define FONT_FIRST		0x20
# define FONT_LAST		0x7E

/* ************************************************************************** */
// 文字列を scale 倍・指定色でバックバッファに描画する（mlx_string_put の代替）
void
	draw_text_scaled(t_window* w, t_pos* pos, char* str, int scale, int color);

#endif
