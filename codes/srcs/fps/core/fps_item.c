#include "core/core.h"
#include "tuning.h"

/* ************************************************************************** */
void
	check_quest(t_game* game);
void
	count_items(t_game* game);
static void
	open_doors(t_game* game);
static void
	clear_goal(t_game* game);

/* ************************************************************************** */
// プレイヤーの現在位置にあるアイテムを取得したか判定し、状態を更新する
void
	check_quest(t_game* game)
{
	if (game->mode == MODE_FPS && IS_GOAL(MAP(game->camera.pos, game->config))) {
		clear_goal(game);
	} else if (IS_COLLECTIBLE(MAP(game->camera.pos, game->config))) {
		MAP(game->camera.pos, game->config) = 'A';
		game->world.collected++;
		delete_sprite(&game->world.sprites, &game->camera.pos);
		if (game->world.to_collect > 0 && game->world.collected >= game->world.to_collect) {
			open_doors(game);
		}
	}
}

/* ************************************************************************** */
// FPSモードでゴールに到達した瞬間の経過時間を固定し、以後はクリア画面を表示する
static void
	clear_goal(t_game* game)
{
	if (game->cleared) {
		return ;
	}
	game->fps.clear_time_ms = get_current_time_ms() - game->start_time_ms;
	if (game->fps.clear_time_ms < 0) {
		game->fps.clear_time_ms = 0;
	}
	game->cleared = 1;
}

/* ************************************************************************** */
// マップ上に存在する収集アイテムの総数を数える
void
	count_items(t_game* game)
{
	int	i;
	int	j;

	game->world.to_collect = 0;
	i = 0;
	while (i < game->config.map.rows) {
		j = 0;
		while (j < game->config.map.columns) {
			if (IS_COLLECTIBLE(MAP_XY(j, i, game->config))) {
				game->world.to_collect++;
			}
			j++;
		}
		i++;
	}
}

/* ************************************************************************** */
// 収集完了時に呼ばれ、マップ上の全ての扉(D)を床('0')へ書き換えて開放する
static void
	open_doors(t_game* game)
{
	int	total;
	int	i;

	total = game->config.map.rows * game->config.map.columns;
	i = 0;
	while (i < total) {
		if (game->config.map.data[i] == DOOR_CHAR) {
			game->config.map.data[i] = '0';
		}
		i++;
	}
}
