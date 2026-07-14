#include <stdlib.h>
#include <unistd.h>
#include "../minilibx-linux/mlx.h"
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
static int
	clear_window(t_window* window);

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
		clear_window(&game->window);
		clear_textures(&game->window, game->assets.tex);
		clear_sprites(&game->world.sprites);
		clear_enemies(&game->world.enemies);
		clear_lights(&game->world);
		clear_assets(game);
		if (game->window.ptr) {
			mlx_destroy_display(game->window.ptr);
			free(game->window.ptr);
			game->window.ptr = NULL;
		}
	}
	exit(code);
	return (code);
}

/* ************************************************************************** */
// 1枚のテクスチャの mlx 画像とパス文字列を解放し、二重解放を防ぐため NULL に戻す
static void
	free_tex(t_window* window, t_tex* tex)
{
	if (tex->tex && window->ptr) {
		mlx_destroy_image(window->ptr, tex->tex);
		tex->tex = NULL;
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

/* ************************************************************************** */
// ウィンドウとイメージのリソースを解放する
static int
	clear_window(t_window* window)
{
	if (window->screen.img) {
		mlx_destroy_image(window->ptr, window->screen.img);
		window->screen.img = NULL;
	}
	if (window->ptr && window->win) {
		mlx_destroy_window(window->ptr, window->win);
		window->win = NULL;
	}
	return (0);
}
