#include <stdlib.h>
#include <unistd.h>
#include "platform/platform.h"
#include "core/core.h"
#include "engine/render/light.h"
#include "gnl/get_next_line.h"
#include "enemy/enemy.h"

/* ************************************************************************** */
int
	exit_error(t_game* game, const char* str);
int
	exit_game(t_game* game, int code);
static void
	free_tex(t_window* window, t_tex* tex);
static void
	clear_assets(t_game* game);

/* ************************************************************************** */
// エラーメッセージを出力し、ゲームを異常終了させる
int
	exit_error(t_game* game, const char* str)
{
	int	unused;

	if (str) {
		unused = write(STDOUT_FILENO, str, ft_strlen(str));
	}
	(void)unused;
	exit_game(game, EXIT_FAILURE);
	return (EXIT_FAILURE);
}

/* ************************************************************************** */
// 使用したメモリやリソースを完全に解放し、ゲームを終了させる
int
	exit_game(t_game* game, int code)
{
	get_next_line(-1, NULL);
	if (game) {
		clear_config(&game->config);
		clear_textures(&game->window, game->assets.tex);
		clear_sprites(&game->world.sprites);
		clear_enemies(&game->world.enemies);
		clear_lights(&game->world);
		clear_assets(game);
		pf_shutdown(&game->window);
	}
	exit(code);
	return (code);
}

/* ************************************************************************** */
// 1枚のテクスチャの mlx 画像とパス文字列を解放し、二重解放を防ぐため NULL に戻す
static void
	free_tex(t_window* window, t_tex* tex)
{
	if (tex->tex) {
		pf_destroy_texture(window, tex);
	}
	if (tex->path) {
		free(tex->path);
		tex->path = NULL;
	}
}

/* ************************************************************************** */
// 武器(6種)・敵(8方向)・手(6種)・死亡画面・扉のテクスチャ画像とパス文字列をすべて解放する
static void
	clear_assets(t_game* game)
{
	int	i;

	i = 0;
	while (i < WEAPON_TEX_COUNT) {
		free_tex(&game->window, &game->assets.weapon_tex[i]);
		i++;
	}
	i = 0;
	while (i < ENEMY_TEX_COUNT) {
		free_tex(&game->window, &game->assets.enemy_tex[i]);
		i++;
	}
	i = 0;
	while (i < TEAM_COUNT * HAND_COUNT) {
		free_tex(&game->window, &game->assets.hand_tex[i]);
		i++;
	}
	free_tex(&game->window, &game->assets.death_tex);
	free_tex(&game->window, &game->assets.door_tex);
	free_tex(&game->window, &game->fps.goal_tex);
}
