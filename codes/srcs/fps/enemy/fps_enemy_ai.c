#include <math.h>

#include "core/core.h"
#include "enemy/enemy.h"
#include "tuning.h"
#include "enemy/enemy_utils.h"

/* ************************************************************************** */
void
	update_fps_enemy(t_enemy* cur, t_game* game, double delta_time);
static void
	move_enemy(t_enemy* cur, t_game* game, t_pos* target, double delta_time);
static void
	track_target(t_enemy* cur, t_game* game, t_pos* target, double delta_time);
static void
	ensure_path(t_enemy* cur, t_config* config, t_pos start, t_pos goal);
static void
	advance_path_index(t_enemy* cur, t_pos start);

/* ************************************************************************** */
// FPSの敵1体ぶんの更新。最寄りの生存中の席を狙い、検知判定で追跡タイマーを
// 更新して移動とテクスチャを反映する。狙える席が居なければ（全員が復帰待ち等）
// 追跡時間を 0 に落として即座に徘徊モードへ戻す。1vs1 では狙う相手が席ごとに
// 変わるためカメラ固定をやめた（G-08）。スプライトの向きだけは「見る側」との
// 角度で決まるので、従来どおりカメラ基準で選ぶ
void
	update_fps_enemy(t_enemy* cur, t_game* game, double delta_time)
{
	t_enemy*	target;
	double		target_angle;
	double		view_angle;

	view_angle = atan2(game->camera.pos.y - cur->sprite->pos.y,
			game->camera.pos.x - cur->sprite->pos.x);
	target = nearest_seat(game, cur);
	if (!target) {
		cur->track_timer = 0.0;
		move_enemy(cur, game, NULL, delta_time);
		update_texture(cur, game, view_angle);
		return ;
	}
	target_angle = atan2(target->sprite->pos.y - cur->sprite->pos.y,
			target->sprite->pos.x - cur->sprite->pos.x);
	if (enemy_sees_target(cur, game, &target->sprite->pos, target_angle)) {
		cur->track_timer = game->config.enemy_track_seconds;
	}
	move_enemy(cur, game, &target->sprite->pos, delta_time);
	update_texture(cur, game, view_angle);
}

/* ************************************************************************** */
// 追跡残時間があれば追跡、尽きていれば巡回へ振り分ける。追跡中は巡回状態を無効化する
static void
	move_enemy(t_enemy* cur, t_game* game, t_pos* target, double delta_time)
{
	if (target && cur->track_timer > 0.0) {
		cur->track_timer -= delta_time;
		cur->state = ENEMY_STATE_WALK;
		cur->patrol_active = 0;
		track_target(cur, game, target, delta_time);
		return ;
	}
	patrol_enemy(cur, game, delta_time, 1.0);
}

/* ************************************************************************** */
// キャッシュ済み経路上の次の1マスへ向かって1フレーム前進する
static void
	track_target(t_enemy* cur, t_game* game, t_pos* target, double delta_time)
{
	t_pos	start;
	t_pos	goal;
	double	aim_x;
	double	aim_y;

	set_pos(&start, floor(cur->sprite->pos.x), floor(cur->sprite->pos.y));
	set_pos(&goal, floor(target->x), floor(target->y));
	aim_x = target->x;
	aim_y = target->y;
	if (!(start.x == goal.x && start.y == goal.y)) {
		ensure_path(cur, &game->config, start, goal);
		advance_path_index(cur, start);
		if (cur->path_valid && cur->path_idx < cur->path_len) {
			aim_x = cur->path[cur->path_idx].x + 0.5;
			aim_y = cur->path[cur->path_idx].y + 0.5;
		}
	}
	cur->dir_angle = atan2(aim_y - cur->sprite->pos.y, aim_x - cur->sprite->pos.x);
	step_enemy(cur, game, delta_time, ENEMY_TRACK_SPEED_MULT);
}

/* ************************************************************************** */
// 終点セルが変わったか経路を使い切った場合のみ、現在地からの最短経路を再計算する
static void
	ensure_path(t_enemy* cur, t_config* config, t_pos start, t_pos goal)
{
	int	len;

	if (cur->path_valid && cur->path_goal.x == goal.x && cur->path_goal.y == goal.y && cur->path_idx < cur->path_len) {
		return ;
	}
	len = bfs_fill_path(config, (int)start.x, (int)start.y, (int)goal.x, (int)goal.y, cur->path);
	if (len <= 0) {
		cur->path_valid = 0;
		return ;
	}
	cur->path_len = len;
	cur->path_idx = 1;
	if (cur->path_idx >= len) {
		cur->path_idx = len - 1;
	}
	copy_pos(&cur->path_goal, &goal);
	cur->path_valid = 1;
}

/* ************************************************************************** */
// 敵が既に到達した経路セルを読み飛ばし、次に向かうべき添字まで進める
static void
	advance_path_index(t_enemy* cur, t_pos start)
{
	while (cur->path_valid && cur->path_idx < cur->path_len && cur->path[cur->path_idx].x == start.x && cur->path[cur->path_idx].y == start.y) {
		cur->path_idx++;
	}
}
