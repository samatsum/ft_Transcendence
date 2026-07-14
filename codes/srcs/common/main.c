#include <fcntl.h>
#include <stdbool.h>
#include <stdlib.h>
#include <unistd.h>
#include "core/core.h"
#include "core/mode_ops.h"
#include "engine/input/input.h"
#include "engine/input/keymap.h"
#include "../minilibx-linux/mlx.h"

#define CUB_ARG_MAP 1
#define CUB_ARG_COUNT 2
#define FPS_MAP_DIR "maps/fps_map/"
#define RSP_MAP_DIR "maps/rsp_map/"

/* ************************************************************************** */
int
	main(int argc, char** argv);
static bool
	validate_check(int argc, char** argv, t_game* game);
static bool
	set_mode_from_path(const char* path, t_game* game);
static bool
	validate_mode_ops(t_game* game);
static bool
	validate_map_file(const char* path, t_game* game);
static bool
	path_contains(const char* path, const char* needle);
static bool
	setup_inits(t_game* game);
static void
	setup_hooks(t_game* game);

/* ************************************************************************** */
// メイン関数。プログラムのエントリポイントとして検証、初期化、メインループの実行を行う
int
	main(int argc, char** argv)
{
	t_game	game = {0};

	if (!validate_check(argc, argv, &game)) {
		return (EXIT_FAILURE);
	}
	if (!setup_inits(&game)) {
		return (EXIT_FAILURE);
	}
	setup_hooks(&game);
	mlx_loop(game.window.ptr);
	return (EXIT_SUCCESS);
}

/* ************************************************************************** */
// 引数とマップファイルを検証し、マップの配置ディレクトリから FPS/RSP モードを決める
static bool
	validate_check(int argc, char** argv, t_game* game)
{
	if (argc <= CUB_ARG_MAP) {
		exit_error(game, "Error:\n no map specified.\n");
		return (false);
	}
	if (argc > CUB_ARG_COUNT) {
		exit_error(game, "Error:\n too many arguments.\n");
		return (false);
	}
	if (!set_mode_from_path(argv[CUB_ARG_MAP], game) || !validate_mode_ops(game)) {
		return (false);
	}
	if (!validate_map_file(argv[CUB_ARG_MAP], game)) {
		return (false);
	}
	init_config(&game->config);
	if (!parse_config(&game->config, argv[CUB_ARG_MAP])) {
		exit_error(game, "Error:\n invalid map content. check syntax, walls, characters, and spawns.\n");
		return (false);
	}
	return (true);
}


/* ************************************************************************** */
// モード操作テーブルに必須関数が揃っているかを検証する
static bool
	validate_mode_ops(t_game* game)
{
	if (!game->mode_ops.init_assets || !game->mode_ops.init_world
		|| !game->mode_ops.combat || !game->mode_ops.respawn
		|| !game->mode_ops.update_enemy || !game->mode_ops.draw_weapon
		|| !game->mode_ops.build_status_text
		|| !game->mode_ops.build_result_text) {
		exit_error(game, "Error:\n invalid mode operations.\n");
		return (false);
	}
	return (true);
}

/* ************************************************************************** */
// マップ格納ディレクトリから起動モードとモード操作テーブルを決定する
static bool
	set_mode_from_path(const char* path, t_game* game)
{
	if (path_contains(path, FPS_MAP_DIR)) {
		game->mode = MODE_FPS;
		game->mode_ops = fps_mode_ops();
		return (true);
	}
	if (path_contains(path, RSP_MAP_DIR)) {
		game->mode = MODE_RSP;
		game->mode_ops = rsp_mode_ops();
		return (true);
	}
	exit_error(game, "Error:\n map must be in maps/fps_map/ or maps/rsp_map/.\n");
	return (false);
}


/* ************************************************************************** */
// マップファイルそのものを検証する（拡張子と open 可否）
static bool
	validate_map_file(const char* path, t_game* game)
{
	int	fd;

	if (!ft_endswith(path, ".cub")) {
		exit_error(game, "Error:\n map file must end with .cub.\n");
		return (false);
	}
	fd = open(path, O_RDONLY);
	if (fd < 0) {
		exit_error(game, "Error:\n failed to open map file.\n");
		return (false);
	}
	close(fd);
	return (true);
}

/* ************************************************************************** */
// path の中に needle が含まれるかを調べる小さな文字列検索
static bool
	path_contains(const char* path, const char* needle)
{
	int	i;
	int	j;

	i = 0;
	while (path[i]) {
		j = 0;
		while (path[i + j] && needle[j] && path[i + j] == needle[j]) {
			j++;
		}
		if (!needle[j]) {
			return (true);
		}
		i++;
	}
	return (false);
}

/* ************************************************************************** */
// システムの初期化処理を完了させる
static bool
	setup_inits(t_game* game)
{
	init_game(game);
	if (!finish_init(game)) {
		return (false);
	}
	return (true);
}

/* ************************************************************************** */
// イベントフックの設定を行う
static void
	setup_hooks(t_game* game)
{
	mlx_hook(game->window.win, EVENT_KEY_PRESS, MASK_KEY_PRESS, &key_press, game);
	mlx_hook(game->window.win, EVENT_KEY_RELEASE, MASK_KEY_RELEASE, &key_release, game);
	mlx_hook(game->window.win, EVENT_EXIT, MASK_CLOSE, &exit_hook, game);
	mlx_hook(game->window.win, EVENT_EXPOSE, MASK_EXPOSE, &expose_hook, game);
	mlx_loop_hook(game->window.ptr, &main_loop, game);
}
