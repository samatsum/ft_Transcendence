#include "core/core.h"
#include "core/respawn.h"
#include "tuning.h"

/* ************************************************************************** */
int
	check_enemy_contact(t_game* game);
static int
	touches_hazard(t_game* game, t_enemy* seat);

/* ************************************************************************** */
// マップ由来の敵（ハザード）に触れた席を死亡させ、死んだ席の数を返す。
// 1vs1 では席が複数あるためカメラ1点ではなく席ごとに判定する。死亡は試合終了
// ではなく、DEATH_DURATION 後に自スポーンへ戻るペナルティ（① §4-C。復帰は
// update_death → mode_ops.respawn が行う）。死亡中の席とハザード同士は判定しない
int
	check_enemy_contact(t_game* game)
{
	t_enemy*	seat;
	int			killed;

	killed = 0;
	seat = game->world.enemies;
	while (seat) {
		if (!seat->is_hazard && seat->death_timer <= 0.0
			&& touches_hazard(game, seat)) {
			seat->death_timer = DEATH_DURATION;
			killed++;
		}
		seat = seat->next;
	}
	return (killed);
}

/* ************************************************************************** */
// 席が生存中のハザードの接触距離内に居るかを返す
static int
	touches_hazard(t_game* game, t_enemy* seat)
{
	t_enemy*	cur;

	cur = game->world.enemies;
	while (cur) {
		if (cur->is_hazard && cur->state != ENEMY_STATE_DEAD
			&& dist_pos(&seat->sprite->pos, &cur->sprite->pos) <= RESPAWN_CONTACT_DIST) {
			return (1);
		}
		cur = cur->next;
	}
	return (0);
}
