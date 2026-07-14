#include "core/core.h"
#include "rsp/rsp_game.h"

/* ************************************************************************** */

int
	init_hand_textures(t_game* game);

/* ************************************************************************** */

// team * HAND_COUNT + hand の並びでハンドテクスチャ6枚を読み込む。RSPモード時に
// finish_init から呼ばれ、UI描画とNPC描画で共有する。1枚でも失敗したら 0 を返す
int
	init_hand_textures(t_game* game)
{
	static const char*	paths[TEAM_COUNT * HAND_COUNT] = {
		"textures/hand/Hand_Red_Rock.xpm",
		"textures/hand/Hand_Red_Scissors.xpm",
		"textures/hand/Hand_Red_Paper.xpm",
		"textures/hand/Hand_Blue_Rock.xpm",
		"textures/hand/Hand_Blue_Scissors.xpm",
		"textures/hand/Hand_Blue_Paper.xpm"
	};
	t_tex*				tex;
	int					i;

	i = 0;
	while (i < TEAM_COUNT * HAND_COUNT) {
		tex = &game->assets.hand_tex[i];
		tex->path = ft_strdup(paths[i]);
		if (!load_tex_image(&game->window, tex)) {
			return (0);
		}
		set_pos(&tex->start, 0, 0);
		set_pos(&tex->end, tex->width, tex->height);
		i++;
	}
	return (1);
}
