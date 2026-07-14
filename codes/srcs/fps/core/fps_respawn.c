#include "core/core.h"
#include "core/respawn.h"
#include "tuning.h"

/* ************************************************************************** */
int
	check_enemy_contact(t_game* game);
static void
	kill_player(t_game* game);

/* ************************************************************************** */
// 生存中の敵とプレイヤーが接触したかを調べ、接触時は死亡演出へ入る。
// 戦闘員リストにはプレイヤー自身も居るため is_player はスキップする（自己接触で
// 即死しないように）
int
	check_enemy_contact(t_game* game)
{
	t_enemy*	cur;

	cur = game->world.enemies;
	while (cur) {
		if (!cur->is_player && cur->state != ENEMY_STATE_DEAD) {
			if (dist_pos(&game->camera.pos, &cur->sprite->pos) <= RESPAWN_CONTACT_DIST) {
				kill_player(game);
				return (1);
			}
		}
		cur = cur->next;
	}
	return (0);
}

/* ************************************************************************** */
// プレイヤーを即時に死亡演出状態へ移す
static void
	kill_player(t_game* game)
{
	game->player->death_timer = DEATH_DURATION;
}
