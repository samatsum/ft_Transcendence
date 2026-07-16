#include <math.h>

#include "core/core.h"
#include "engine/raycast/raycast.h"
#include "platform/platform.h"
#include "platform/sim.h"
#include "rsp/rsp.h"

/* ************************************************************************** */
// snapshot に居なくなった表示ノードの退避先（マップ外の遠方。描画対象外になる）
#define SNAPSHOT_PARK_POS	-1000.0

/* ************************************************************************** */
int
	game_apply_snapshot(t_game* game, const double* snap, int len, int view_id);
int
	web_apply_snapshot(const double* snap, int len, int view_id);
static const double*
	find_view_entry(const double* snap, int count, int view_id);
static void
	apply_view_combatant(t_game* game, const double* entry);
static void
	apply_remote_combatant(t_game* game, t_enemy* node, const double* entry);
static void
	apply_combatants(t_game* game, const double* snap, int count, const double* view);
static int
	id_in_snapshot(const double* snap, int count, int id);
static t_enemy*
	find_display_node(t_game* game, int id);
static t_enemy*
	claim_display_node(t_game* game, const double* snap, int count);
static void
	park_stale_nodes(t_game* game, const double* snap, int count);

/* ************************************************************************** */
// 受信スナップショット（補間済みのフラット f64 配列。レイアウトは
// platform/sim.h）を表示用 t_game へ書き込む（① §3-B。クライアント専用）。
// 勝敗・スコアの正本はサーバであり、ここでは一切判定しない（② §5-C）。
// view_id の席はカメラとして導出し、他の席は敵スプライト描画の位置・向き・
// 手として反映する
int
	game_apply_snapshot(t_game* game, const double* snap, int len, int view_id)
{
	int				count;
	const double*	view;
	t_enemy*		stale;

	if (!game || !snap || len < SIM_SNAP_HEADER_DOUBLES) {
		return (0);
	}
	count = (int)snap[4];
	if (count < 1
		|| len < SIM_SNAP_HEADER_DOUBLES + count * SIM_SNAP_COMBATANT_DOUBLES) {
		return (0);
	}
	game->rsp.score[TEAM_RED] = (int)snap[2];
	game->rsp.score[TEAM_BLUE] = (int)snap[3];
	game->cleared = ((int)snap[0] == SIM_STATE_FINISHED);
	game->rsp.winner = -1;
	if (game->cleared) {
		game->rsp.winner = (int)snap[1];
	}
	view = find_view_entry(snap, count, view_id);
	stale = find_display_node(game, (int)view[0]);
	if (stale) {
		// 視点切替で「以前は他人席として表示していた席」が視点になった場合、
		// そのノードを未割当へ戻す（残すと視点と同じ席のゴーストが表示される）
		stale->combatant_id = -1;
	}
	apply_combatants(game, snap, count, view);
	apply_view_combatant(game, view);
	return (1);
}

/* ************************************************************************** */
// JS から呼ぶ薄い入口。表示用ゲーム状態（web_main.c の g_game）へ委譲する
int
	web_apply_snapshot(const double* snap, int len, int view_id)
{
	return (game_apply_snapshot(web_game(), snap, len, view_id));
}

/* ************************************************************************** */
// view_id の席のスナップショット要素を探す。見つからない場合（観戦などで
// 自席が無い）は先頭の戦闘員を視点にフォールバックする
static const double*
	find_view_entry(const double* snap, int count, int view_id)
{
	const double*	entry;
	int				i;

	i = 0;
	while (i < count) {
		entry = snap + SIM_SNAP_HEADER_DOUBLES + i * SIM_SNAP_COMBATANT_DOUBLES;
		if ((int)entry[0] == view_id) {
			return (entry);
		}
		i++;
	}
	return (snap + SIM_SNAP_HEADER_DOUBLES);
}

/* ************************************************************************** */
// 視点席以外のスナップショット要素を combatant_id で表示ノードへ対応づけて
// 反映する。id 未知の要素は「snapshot に現れない id を持つノード」を1つ
// 主張して割り当てる（初回はどのノードも id=-1 なので順に埋まり、以後は id が
// 固定される）。表示ノードが足りない要素は捨て、snapshot から消えたノードは
// マップ外へ退避する（FPS ハザード消滅・観戦・数の不一致に対して安全）
static void
	apply_combatants(t_game* game, const double* snap, int count, const double* view)
{
	const double*	entry;
	t_enemy*		node;
	int				i;

	i = 0;
	while (i < count) {
		entry = snap + SIM_SNAP_HEADER_DOUBLES + i * SIM_SNAP_COMBATANT_DOUBLES;
		if (entry != view) {
			node = find_display_node(game, (int)entry[0]);
			if (!node) {
				node = claim_display_node(game, snap, count);
			}
			if (node) {
				apply_remote_combatant(game, node, entry);
			}
		}
		i++;
	}
	park_stale_nodes(game, snap, count);
}

/* ************************************************************************** */
// id がスナップショットのいずれかの戦闘員要素に含まれるかを返す
static int
	id_in_snapshot(const double* snap, int count, int id)
{
	int	i;

	i = 0;
	while (i < count) {
		if ((int)snap[SIM_SNAP_HEADER_DOUBLES + i * SIM_SNAP_COMBATANT_DOUBLES] == id) {
			return (1);
		}
		i++;
	}
	return (0);
}

/* ************************************************************************** */
// combatant_id が一致するプレイヤー以外の表示ノードを探す
static t_enemy*
	find_display_node(t_game* game, int id)
{
	t_enemy*	node;

	node = game->world.enemies;
	while (node) {
		if (!node->is_player && node->combatant_id == id) {
			return (node);
		}
		node = node->next;
	}
	return (NULL);
}

/* ************************************************************************** */
// スナップショットに現れない id を持つ（＝どの要素にも対応していない）
// プレイヤー以外のノードを1つ返す。呼び出し側が id を書き込んだ時点で
// このノードは以後 claim 対象から外れる
static t_enemy*
	claim_display_node(t_game* game, const double* snap, int count)
{
	t_enemy*	node;

	node = game->world.enemies;
	while (node) {
		if (!node->is_player && !id_in_snapshot(snap, count, node->combatant_id)) {
			return (node);
		}
		node = node->next;
	}
	return (NULL);
}

/* ************************************************************************** */
// スナップショットから消えた戦闘員の表示ノードをマップ外へ退避する
// （sprite は描画リストに残るが、カメラから見えない遠方なので描かれない）
static void
	park_stale_nodes(t_game* game, const double* snap, int count)
{
	t_enemy*	node;

	node = game->world.enemies;
	while (node) {
		if (!node->is_player && !id_in_snapshot(snap, count, node->combatant_id)) {
			set_pos(&node->sprite->pos, SNAPSHOT_PARK_POS, SNAPSHOT_PARK_POS);
		}
		node = node->next;
	}
}

/* ************************************************************************** */
// 他人の席（リモート人間・AI・敵ハザード共通）を1ノードへ反映する。RSP は
// チーム×手のハンドテクスチャへ差し替える（AI 更新が走らない表示専用モードでは
// ここが唯一の反映点）
static void
	apply_remote_combatant(t_game* game, t_enemy* node, const double* entry)
{
	node->combatant_id = (int)entry[0];
	node->rsp.team = (t_team)(int)entry[1];
	node->rsp.hand = (t_hand)(int)entry[2];
	set_pos(&node->sprite->pos, entry[3], entry[4]);
	node->dir_angle = entry[5];
	node->rsp.alive = (int)entry[6];
	node->input_source = ((int)entry[7]) ? INPUT_SRC_AI : INPUT_SRC_EXTERNAL;
	if (game->mode == MODE_RSP) {
		node->sprite->tex
			= &game->assets.hand_tex[HAND_SLOT(node->rsp.team, node->rsp.hand)];
	}
}

/* ************************************************************************** */
// 視点席をプレイヤーノードへ反映し、カメラを戦闘員から完全導出する
// （E-12: ローカル操作時の「カメラが正本」を反転し、スナップショットが正本）。
// plane は apply_spawn と同じ規約（dir に直交・大きさ fov）で再構築する
static void
	apply_view_combatant(t_game* game, const double* entry)
{
	t_camera*	cam;

	if (game->player) {
		game->player->combatant_id = (int)entry[0];
		game->player->rsp.team = (t_team)(int)entry[1];
		game->player->rsp.hand = (t_hand)(int)entry[2];
		set_pos(&game->player->sprite->pos, entry[3], entry[4]);
		game->player->dir_angle = entry[5];
		game->player->rsp.alive = (int)entry[6];
	}
	cam = &game->camera;
	set_pos(&cam->pos, entry[3], entry[4]);
	set_pos(&cam->dir, cos(entry[5]), sin(entry[5]));
	set_pos(&cam->plane, -cam->dir.y * game->config.fov,
		cam->dir.x * game->config.fov);
	set_pos(&cam->x_dir, cam->dir.y, -cam->dir.x);
}
