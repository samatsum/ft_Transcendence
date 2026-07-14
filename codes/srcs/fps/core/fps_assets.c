#include "core/core.h"             /* t_game 定義・自身のプロトタイプ・load_tex_image のため */
#include "tuning.h"                /* DEATH_TEX_PATH, DOOR_TEX_PATH, GOAL_TEX_PATH 用 */

/* ************************************************************************** */
void
	load_player_assets(t_game* game);
static void
	load_one_tex(t_window* window, t_tex* tex, const char* path_src);

/* ************************************************************************** */
// プレイヤー視点のアセット（武器/手・死亡画面・扉）のテクスチャをまとめて読み込む。1枚ぶんの
// 読込は load_one_tex に委譲し、ここでは対象のパス一覧を並べて順に渡すだけ（finish_init から
// 切り出し）。読み込み失敗は致命とせず、その武器/演出/扉が描画されないだけに留める
void
	load_player_assets(t_game* game)
{
	const char*	paths[WEAPON_TEX_COUNT];
	int			i;

	paths[WTEX_PISTOL_IDLE] = "textures/arm/Arm_pistol_static.xpm";
	paths[WTEX_PISTOL_SHOOT] = "textures/arm/Arm_pistol_shoot.xpm";
	paths[WTEX_PISTOL_RECOIL] = "textures/arm/Arm_pistol_recoil.xpm";
	paths[WTEX_FLASHLIGHT] = "textures/arm/Arm_flashlight.xpm";
	paths[WTEX_HAND_LEFT] = "textures/arm/Arm_lefthand.xpm";
	paths[WTEX_HAND_RIGHT] = "textures/arm/Arm_righthand.xpm";
	i = 0;
	while (i < WEAPON_TEX_COUNT) {
		load_one_tex(&game->window, &game->assets.weapon_tex[i], paths[i]);
		i++;
	}
	load_one_tex(&game->window, &game->assets.death_tex, DEATH_TEX_PATH);
	load_one_tex(&game->window, &game->assets.door_tex, DOOR_TEX_PATH);
	load_one_tex(&game->window, &game->fps.goal_tex, GOAL_TEX_PATH);
}

/* ************************************************************************** */
// テクスチャ1枚を読み込む。パスを strdup して tex->path に控え、共通の load_tex_image へ委譲する
// (load_tex_image が NULL パスを弾くので strdup 失敗時も安全＝非致命)。3系統(武器/死亡/扉)で共有
static void
	load_one_tex(t_window* window, t_tex* tex, const char* path_src)
{
	tex->path = ft_strdup(path_src);
	if (load_tex_image(window, tex)) {
		set_pos(&tex->start, 0, 0);
		set_pos(&tex->end, tex->width, tex->height);
	}
}
