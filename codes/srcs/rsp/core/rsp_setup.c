#include "core/core.h"              /* t_game 定義のため */
#include "engine/raycast/raycast.h" /* pick_spawn_indices, apply_spawn のため */
#include "enemy/enemy.h"            /* add_enemy, t_enemy のため */
#include "rsp/rsp_game.h"           /* RSP_* 定数・自身のプロトタイプのため */

/* ************************************************************************** */
int
	setup_rsp_combatants(t_game* game);
static int
	place_combatants(t_game* game, int* pts, int player);
static void
	set_rsp_player(t_game* game, t_spawn_point* sp, t_team team, int hand);
static int
	spawn_rsp_npc(t_game* game, t_spawn_point* sp, t_team team, int hand);

/* ************************************************************************** */
// RSPの戦闘員を確定する。赤(N/W)から2地点、青(S/E)から2地点を重複なく選び、
// 各チーム2地点に満たなければ 0。プレイヤーを4地点から1つランダムに選び、残りを
// NPCにする。前提（各チーム2地点以上）が崩れたマップでは生成失敗とする。
// find_sprites(init.c)から RSPモード時のみ呼ばれる窓口（公開関数）
int
	setup_rsp_combatants(t_game* game)
{
	int	pts[RSP_COMBATANTS];
	int	n;
	int	player;

	n = pick_spawn_indices(&game->config, RSP_RED_DIRS, &game->rsp.seed, pts, RSP_TEAM_SPAWNS);
	n += pick_spawn_indices(&game->config, RSP_BLUE_DIRS, &game->rsp.seed, pts + n, RSP_TEAM_SPAWNS);
	if (n < RSP_COMBATANTS) {
		return (0);
	}
	player = (int)((unsigned int)ft_rand(&game->rsp.seed) % RSP_COMBATANTS);
	return (place_combatants(game, pts, player));
}

/* ************************************************************************** */
// 4地点を順に処理する。前半 RSP_TEAM_SPAWNS 個が赤、後半が青。各員の初期手は
// ランダム。player 番だけプレイヤー（カメラ＋rsp.player）、他は NPC を生成する
static int
	place_combatants(t_game* game, int* pts, int player)
{
	t_team	team;
	int		hand;
	int		i;

	i = 0;
	while (i < RSP_COMBATANTS) {
		team = TEAM_RED;
		if (i >= RSP_TEAM_SPAWNS) {
			team = TEAM_BLUE;
		}
		hand = (int)((unsigned int)ft_rand(&game->rsp.seed) % HAND_COUNT);
		if (i == player) {
			set_rsp_player(game, &game->config.spawns[pts[i]], team, hand);
		} else if (!spawn_rsp_npc(game, &game->config.spawns[pts[i]], team, hand)) {
			return (0);
		}
		i++;
	}
	return (1);
}

/* ************************************************************************** */
// プレイヤーを指定スポーンへ配置し、チーム・手・初期リスポーン地点・生存を記録する
static void
	set_rsp_player(t_game* game, t_spawn_point* sp, t_team team, int hand)
{
	apply_spawn(&game->config, &game->camera, sp);
	game->rsp.player.team = team;
	game->rsp.player.hand = (t_hand)hand;
	copy_pos(&game->rsp.player.spawn, &sp->pos);
	game->rsp.player.alive = 1;
}

/* ************************************************************************** */
// NPC1体を生成する。team×hand のハンドテクスチャでスプライトを作り、敵リストへ
// 追加して rsp 状態（チーム・手・初期リスポーン地点・生存）を埋める
static int
	spawn_rsp_npc(t_game* game, t_spawn_point* sp, t_team team, int hand)
{
	t_tex*		tex;
	t_sprite*	sprite;
	t_enemy*	enemy;

	tex = &game->assets.hand_tex[HAND_SLOT(team, hand)];
	sprite = add_front_sprite(&game->world.sprites, 0., &sp->pos, tex);
	if (!sprite) {
		return (0);
	}
	enemy = add_enemy(&game->world.enemies, sprite, (int)game->config.enemy_hp);
	if (!enemy) {
		delete_sprite_node(&game->world.sprites, sprite);
		return (0);
	}
	enemy->rsp.team = team;
	enemy->rsp.hand = (t_hand)hand;
	copy_pos(&enemy->rsp.spawn, &sp->pos);
	enemy->rsp.alive = 1;
	return (1);
}
