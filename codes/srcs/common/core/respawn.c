#include <math.h>

#include "core/core.h"
#include "core/respawn.h"

/* ************************************************************************** */
void
	respawn_at(t_game* game, const char* allowed);
void
	respawn_combatant(t_game* game, t_enemy* combatant);
void
	save_spawn(t_game* game);
void
	sync_player_from_camera(t_game* game);
int
	is_player_dead(t_game* game);
void
	update_death(t_game* game, double delta_time);

/* ************************************************************************** */
// 指定された向きのスポーン候補から1つ選び、カメラをその地点へ戻す。プレイヤー
// 戦闘員ノードがあれば復帰地点を spawn に控え、位置・向きを同期する
void
	respawn_at(t_game* game, const char* allowed)
{
	int	idx;

	idx = pick_spawn_index(&game->config, allowed, &game->rsp.seed);
	if (idx < 0) {
		return ;
	}
	apply_spawn(&game->config, &game->camera, &game->config.spawns[idx]);
	if (game->player) {
		game->player->spawn = game->camera;
	}
	sync_player_from_camera(game);
}

/* ************************************************************************** */
// 戦闘員を「自分の」開始地点へ戻す。spawn は生成時に確定した位置と向きで、
// 以後上書きしない安定したアンカーなので、1vs1 では各自が自分の地点へ戻る
// （① §4-C の「自スポーンへリスポーン」）。ローカル自席の場合は移動計算の
// 作業領域であるカメラも同じ地点から作り直す。AI の追跡経路は捨てる
void
	respawn_combatant(t_game* game, t_enemy* combatant)
{
	if (!combatant) {
		return ;
	}
	copy_pos(&combatant->sprite->pos, &combatant->spawn.pos);
	combatant->dir_angle = atan2(combatant->spawn.dir.y, combatant->spawn.dir.x);
	combatant->path_valid = 0;
	combatant->state = ENEMY_STATE_IDLE;
	if (combatant == game->player) {
		game->camera = combatant->spawn;
	}
}

/* ************************************************************************** */
// 初期状態のスポーン位置として、通常の全方向スポーンから1つ保存する
void
	save_spawn(t_game* game)
{
	respawn_at(game, DIRECTIONS);
}

/* ************************************************************************** */
// カメラの位置・向きをプレイヤー戦闘員ノードへ書き戻す。移動計算は従来どおり
// カメラ座標系で行い（統合前と浮動小数まで一致させるため）、リスト側は接触判定・
// AI・将来のスナップショットが読む正本として毎フレーム同期する
void
	sync_player_from_camera(t_game* game)
{
	if (!game->player) {
		return ;
	}
	copy_pos(&game->player->sprite->pos, &game->camera.pos);
	game->player->dir_angle = atan2(game->camera.dir.y, game->camera.dir.x);
}

/* ************************************************************************** */
// プレイヤー戦闘員の死亡演出タイマーが残っている間はプレイヤー死亡中として扱う
int
	is_player_dead(t_game* game)
{
	return (game->player && game->player->death_timer > 0.0);
}

/* ************************************************************************** */
// プレイヤー戦闘員の死亡演出タイマーを進め、終了したら現在モードの復帰処理を呼ぶ
void
	update_death(t_game* game, double delta_time)
{
	if (!game->player || game->player->death_timer <= 0.0) {
		return ;
	}
	game->player->death_timer -= delta_time;
	if (game->player->death_timer <= 0.0) {
		game->player->death_timer = 0.0;
		game->mode_ops.respawn(game);
	}
}
