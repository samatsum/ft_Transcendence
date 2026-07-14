#include "core/core.h"
#include "rsp/rsp_game.h"
#include "tuning.h"

/* ************************************************************************** */

void
	resolve_rsp_combat(t_game* game);
static void
	rsp_home_rehand(t_game* game);
static void
	resolve_contact(t_game* game, t_enemy* a, t_enemy* b);
static void
	apply_rsp_outcome(t_game* game, t_enemy* winner, t_enemy* loser);
static void
	respawn_loser(t_game* game, t_enemy* loser);
static void
	respawn_npc(t_game* game, t_enemy* npc);
static void
	award_rsp_point(t_game* game, t_team team);
static int
	in_contact(t_pos* a, t_pos* b);

/* ************************************************************************** */

// 毎フレーム、戦闘員リストの全ペアを列挙し、各接触の勝敗処理を解決する。
// 戦闘員統合によりプレイヤーもリストの1ノードなので、プレイヤー用・NPC用の
// 個別走査は不要になった（各ペアは1回だけ判定される）
void
	resolve_rsp_combat(t_game* game)
{
	t_enemy*	a;
	t_enemy*	b;

	if (game->cleared) {
		return ;
	}
	rsp_home_rehand(game);
	a = game->world.enemies;
	while (a) {
		b = a->next;
		while (b) {
			resolve_contact(game, a, b);
			if (game->cleared) {
				return ;
			}
			b = b->next;
		}
		a = a->next;
	}
}

/* ************************************************************************** */

// プレイヤーが自陣スポーンマス（赤=N/W、青=S/E）へ新たに踏み込んだ瞬間に、手を
// rsp_rehand で今と違う手へ変える。乗りっぱなしでは変えない（入った1回だけ）
static void
	rsp_home_rehand(t_game* game)
{
	int	c;
	int	on_home;

	c = MAP(game->camera.pos, game->config);
	on_home = ((game->player->rsp.team == TEAM_RED && IS_RED_SPAWN(c))
			|| (game->player->rsp.team == TEAM_BLUE && IS_BLUE_SPAWN(c)));
	if (on_home && !game->rsp.on_home) {
		game->player->rsp.hand = rsp_rehand(game->player->rsp.hand, &game->rsp.seed);
	}
	game->rsp.on_home = on_home;
}

/* ************************************************************************** */

// 1つの接触候補について、異チーム・接触中なら手の勝敗を判定する
static void
	resolve_contact(t_game* game, t_enemy* a, t_enemy* b)
{
	t_rsp_result	res;

	if (a->rsp.team == b->rsp.team) {
		return ;
	}
	if (!in_contact(&a->sprite->pos, &b->sprite->pos)) {
		return ;
	}
	res = rsp_outcome(a->rsp.hand, b->rsp.hand);
	if (res == RSP_WIN) {
		apply_rsp_outcome(game, a, b);
	} else if (res == RSP_LOSE) {
		apply_rsp_outcome(game, b, a);
	}
}

/* ************************************************************************** */

// 勝者に得点を入れ、ゲーム継続中なら敗者だけをリスポーンさせる
static void
	apply_rsp_outcome(t_game* game, t_enemy* winner, t_enemy* loser)
{
	award_rsp_point(game, winner->rsp.team);
	if (!game->cleared) {
		respawn_loser(game, loser);
	}
}

/* ************************************************************************** */

// 敗者の入力源に応じてプレイヤーまたはNPCのリスポーン処理を呼び分ける
static void
	respawn_loser(t_game* game, t_enemy* loser)
{
	if (loser->is_player) {
		game->mode_ops.respawn(game);
	} else {
		respawn_npc(game, loser);
	}
}

/* ************************************************************************** */

// NPC を自チームのスポーンプール（赤=N/W、青=S/E）へ即時に移し、手を rsp_rehand
// で必ず変える。追跡経路は無効化し IDLE に戻す。チームは不変
static void
	respawn_npc(t_game* game, t_enemy* npc)
{
	const char*	allowed;
	int			idx;

	allowed = RSP_RED_DIRS;
	if (npc->rsp.team == TEAM_BLUE) {
		allowed = RSP_BLUE_DIRS;
	}
	idx = pick_spawn_index(&game->config, allowed, &game->rsp.seed);
	if (idx >= 0) {
		copy_pos(&npc->sprite->pos, &game->config.spawns[idx].pos);
		copy_pos(&npc->rsp.spawn, &game->config.spawns[idx].pos);
	}
	npc->rsp.hand = rsp_rehand(npc->rsp.hand, &game->rsp.seed);
	npc->path_valid = 0;
	npc->state = ENEMY_STATE_IDLE;
}

/* ************************************************************************** */

// 勝ったチームへ1点を加え、先取点に到達したら勝者を固定してゲームを終了する
static void
	award_rsp_point(t_game* game, t_team team)
{
	if (game->cleared) {
		return ;
	}
	game->rsp.score[team]++;
	if (game->rsp.score[team] >= RSP_SCORE_LIMIT) {
		game->rsp.winner = (int)team;
		game->cleared = 1;
	}
}

/* ************************************************************************** */

// 2点の中心間距離が接触しきい値以下かを返す（接触判定。FPSの接触と同じ尺度）
static int
	in_contact(t_pos* a, t_pos* b)
{
	return (dist_pos(a, b) <= RESPAWN_CONTACT_DIST);
}
