#include <stdlib.h>

#include "core/core.h"
#include "enemy/enemy.h"

/* ************************************************************************** */
t_enemy*
	add_enemy(t_enemy** enemies, t_sprite* sprite, int hp);
static void
	delete_enemy(t_enemy** enemies, t_sprite** sprites, t_sprite* target);
void
	clear_enemies(t_enemy** enemies);
void
	damage_enemy(t_game* game, t_sprite* hit_sprite);
void
	update_enemies(t_game* game, double delta_time);

/* ************************************************************************** */
// 新しい敵を生成し、指定HPで初期化してリストの先頭に追加する
t_enemy*
	add_enemy(t_enemy** enemies, t_sprite* sprite, int hp)
{
	t_enemy*	new_enemy;

	new_enemy = (t_enemy*)malloc(sizeof(*new_enemy));
	if (!new_enemy) {
		return (NULL);
	}
	new_enemy->hp = hp;
	new_enemy->state = ENEMY_STATE_IDLE;
	new_enemy->patrol_active = 0;
	new_enemy->path_valid = 0;
	new_enemy->path_len = 0;
	new_enemy->path_idx = 0;
	new_enemy->dir_angle = 0.0;
	new_enemy->track_timer = 0.0;
	new_enemy->patrol_from.x = 0.0;
	new_enemy->patrol_from.y = 0.0;
	new_enemy->patrol_target.x = 0.0;
	new_enemy->patrol_target.y = 0.0;
	new_enemy->path_goal.x = 0.0;
	new_enemy->path_goal.y = 0.0;
	new_enemy->sprite = sprite;
	new_enemy->next = *enemies;
	*enemies = new_enemy;
	return (new_enemy);
}

/* ************************************************************************** */
// 対象のスプライトを持つ敵を検索し、敵リストとスプライトリストの両方から削除する
static void
	delete_enemy(t_enemy** enemies, t_sprite** sprites, t_sprite* target)
{
	t_enemy*	current;
	t_enemy*	previous;
	t_enemy*	tmp;
	t_sprite*	s_curr;
	t_sprite*	s_prev;

	current = *enemies;
	previous = NULL;
	while (current) {
		if (current->sprite == target) {
			tmp = current;
			if (!previous) {
				*enemies = tmp->next;
			} else {
				previous->next = tmp->next;
			}
			
			// 座標ではなくポインタの一致で確実に対象スプライトのみを削除する
			s_curr = *sprites;
			s_prev = NULL;
			while (s_curr) {
				if (s_curr == target) {
					if (!s_prev) {
						*sprites = s_curr->next;
					} else {
						s_prev->next = s_curr->next;
					}
					free(s_curr);
					break ;
				}
				s_prev = s_curr;
				s_curr = s_curr->next;
			}

			free(tmp);
			tmp = NULL;
			return ;
		}
		previous = current;
		current = current->next;
	}
}

/* ************************************************************************** */
// 敵リストの全メモリを解放する
void
	clear_enemies(t_enemy** enemies)
{
	t_enemy*	tmp;

	while (*enemies) {
		tmp = (*enemies)->next;
		free(*enemies);
		*enemies = tmp;
	}
	*enemies = NULL;
}

/* ************************************************************************** */
// ヒットしたスプライトから敵を特定し、ダメージを与える
void
	damage_enemy(t_game* game, t_sprite* hit_sprite)
{
	t_enemy*	current;

	current = game->world.enemies;
	while (current) {
		if (current->sprite == hit_sprite) {
			if (current->hp > 0) {
				current->hp -= 1;
				if (current->hp <= 0) {
					delete_enemy(&game->world.enemies, &game->world.sprites, hit_sprite);
				}
			}
			return ;
		}
		current = current->next;
	}
}

/* ************************************************************************** */
// 毎フレーム全敵を更新する。mode で振り分け、RSPはじゃんけんAI(update_rsp_enemy)、
// FPSは追跡AI(update_fps_enemy)を各敵に適用する。両モード共通のディスパッチャ
void
	update_enemies(t_game* game, double delta_time)
{
	t_enemy*	cur;

	cur = game->world.enemies;
	while (cur) {
		game->mode_ops.update_enemy(cur, game, delta_time);
		cur = cur->next;
	}
}
