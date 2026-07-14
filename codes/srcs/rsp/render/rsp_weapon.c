#include "core/core.h"
#include "engine/render/render.h"
#include "rsp/rsp.h"
#include "tuning.h"

/* ************************************************************************** */
void
	render_rsp_hand(t_game* game);

/* ************************************************************************** */
// RSPのプレイヤーUI。自分のチーム×手のハンドテクスチャを画面下部中央へ描画する
void
	render_rsp_hand(t_game* game)
{
	t_tex*	tex;
	double	scale;
	double	start_x;
	double	start_y;

	tex = &game->assets.hand_tex[HAND_SLOT(game->rsp.player.team, game->rsp.player.hand)];
	if (!tex->tex) {
		return ;
	}
	scale = (game->window.size.y * WEAPON_SCALE_SMALL) / tex->height;
	start_x = (game->window.size.x - (tex->width * scale)) / 2.0;
	start_y = game->window.size.y - (tex->height * scale);
	draw_overlay(game, tex, start_x, start_y, scale);
}
