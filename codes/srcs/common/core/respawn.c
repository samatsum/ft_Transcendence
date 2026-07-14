#include "core/core.h"
#include "core/respawn.h"

/* ************************************************************************** */
void
	respawn_at(t_game* game, const char* allowed);
void
	save_spawn(t_game* game);
int
	is_player_dead(t_game* game);
void
	update_death(t_game* game, double delta_time);

/* ************************************************************************** */
// 指定された向きのスポーン候補から1つ選び、カメラをその地点へ戻す
void
	respawn_at(t_game* game, const char* allowed)
{
	int	idx;

	idx = pick_spawn_index(&game->config, allowed, &game->rsp.seed);
	if (idx < 0) {
		return ;
	}
	apply_spawn(&game->config, &game->camera, &game->config.spawns[idx]);
}

/* ************************************************************************** */
// 初期状態のスポーン位置として、通常の全方向スポーンから1つ保存する
void
	save_spawn(t_game* game)
{
	respawn_at(game, DIRECTIONS);
}

/* ************************************************************************** */
// 死亡演出タイマーが残っている間はプレイヤー死亡中として扱う
int
	is_player_dead(t_game* game)
{
	return (game->death_timer > 0.0);
}

/* ************************************************************************** */
// 死亡演出タイマーを進め、終了したら現在モードの復帰処理を呼ぶ
void
	update_death(t_game* game, double delta_time)
{
	if (game->death_timer <= 0.0) {
		return ;
	}
	game->death_timer -= delta_time;
	if (game->death_timer <= 0.0) {
		game->death_timer = 0.0;
		game->mode_ops.respawn(game);
	}
}
