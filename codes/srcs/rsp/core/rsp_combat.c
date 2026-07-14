#include "core/core.h"
#include "rsp/rsp_game.h"
#include "tuning.h"

/* ************************************************************************** */

typedef enum e_rsp_actor
{
	RSP_ACTOR_PLAYER = 0,
	RSP_ACTOR_NPC
}   t_rsp_actor;

typedef struct s_rsp_combatant
{
	t_rsp_actor		type;
	t_rsp_state*	state;
	t_pos*			pos;
	t_enemy*		npc;
}   t_rsp_combatant;

/* ************************************************************************** */

void
	resolve_rsp_combat(t_game* game);
static void
	rsp_home_rehand(t_game* game);
static void
	resolve_player_contacts(t_game* game);
static void
	resolve_npc_contacts(t_game* game);
static void
	resolve_contact(t_game* game, t_rsp_combatant a, t_rsp_combatant b);
static void
	apply_rsp_outcome(t_game* game, t_rsp_combatant winner, t_rsp_combatant loser);
static t_rsp_combatant
	player_combatant(t_game* game);
static t_rsp_combatant
	npc_combatant(t_enemy* npc);
static void
	respawn_combatant(t_game* game, t_rsp_combatant combatant);
static void
	respawn_npc(t_game* game, t_enemy* npc);
static void
	award_rsp_point(t_game* game, t_team team);
static int
	in_contact(t_pos* a, t_pos* b);

/* ************************************************************************** */

// 毎フレーム、RSPの接触ペアを列挙し、各接触の勝敗処理を解決する。
// ペア探索・勝敗判定・加点・リスポーンを分け、追加ルールの差し込み口を保つ
void
	resolve_rsp_combat(t_game* game)
{
	if (game->cleared) {
		return ;
	}
	rsp_home_rehand(game);
	resolve_player_contacts(game);
	if (game->cleared) {
		return ;
	}
	resolve_npc_contacts(game);
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
	on_home = ((game->rsp.player.team == TEAM_RED && IS_RED_SPAWN(c))
			|| (game->rsp.player.team == TEAM_BLUE && IS_BLUE_SPAWN(c)));
	if (on_home && !game->rsp.on_home) {
		game->rsp.player.hand = rsp_rehand(game->rsp.player.hand, &game->rsp.seed);
	}
	game->rsp.on_home = on_home;
}

/* ************************************************************************** */

// プレイヤーと全NPCの接触候補を列挙し、接触ごとの解決へ渡す
static void
	resolve_player_contacts(t_game* game)
{
	t_enemy*	npc;

	npc = game->world.enemies;
	while (npc) {
		resolve_contact(game, player_combatant(game), npc_combatant(npc));
		if (game->cleared) {
			return ;
		}
		npc = npc->next;
	}
}

/* ************************************************************************** */

// NPC同士の全ペアを列挙し、接触ごとの解決へ渡す
static void
	resolve_npc_contacts(t_game* game)
{
	t_enemy*	a;
	t_enemy*	b;

	a = game->world.enemies;
	while (a) {
		b = a->next;
		while (b) {
			resolve_contact(game, npc_combatant(a), npc_combatant(b));
			if (game->cleared) {
				return ;
			}
			b = b->next;
		}
		a = a->next;
	}
}

/* ************************************************************************** */

// 1つの接触候補について、異チーム・接触中なら手の勝敗を判定する
static void
	resolve_contact(t_game* game, t_rsp_combatant a, t_rsp_combatant b)
{
	t_rsp_result	res;

	if (a.state->team == b.state->team) {
		return ;
	}
	if (!in_contact(a.pos, b.pos)) {
		return ;
	}
	res = rsp_outcome(a.state->hand, b.state->hand);
	if (res == RSP_WIN) {
		apply_rsp_outcome(game, a, b);
	} else if (res == RSP_LOSE) {
		apply_rsp_outcome(game, b, a);
	}
}

/* ************************************************************************** */

// 勝者に得点を入れ、ゲーム継続中なら敗者だけをリスポーンさせる
static void
	apply_rsp_outcome(t_game* game, t_rsp_combatant winner, t_rsp_combatant loser)
{
	award_rsp_point(game, winner.state->team);
	if (!game->cleared) {
		respawn_combatant(game, loser);
	}
}

/* ************************************************************************** */

// プレイヤーを接触解決で扱うための軽量ビューにする
static t_rsp_combatant
	player_combatant(t_game* game)
{
	t_rsp_combatant	combatant;

	combatant.type = RSP_ACTOR_PLAYER;
	combatant.state = &game->rsp.player;
	combatant.pos = &game->camera.pos;
	combatant.npc = NULL;
	return (combatant);
}

/* ************************************************************************** */

// NPCを接触解決で扱うための軽量ビューにする
static t_rsp_combatant
	npc_combatant(t_enemy* npc)
{
	t_rsp_combatant	combatant;

	combatant.type = RSP_ACTOR_NPC;
	combatant.state = &npc->rsp;
	combatant.pos = &npc->sprite->pos;
	combatant.npc = npc;
	return (combatant);
}

/* ************************************************************************** */

// 敗者の種類に応じてプレイヤーまたはNPCのリスポーン処理を呼び分ける
static void
	respawn_combatant(t_game* game, t_rsp_combatant combatant)
{
	if (combatant.type == RSP_ACTOR_PLAYER) {
		game->mode_ops.respawn(game);
	} else {
		respawn_npc(game, combatant.npc);
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
