#include "core/core.h"
#include "core/mode_ops.h"
#include "core/respawn.h"
#include "rsp/rsp_game.h"
#include "enemy/enemy_utils.h"
#include "engine/render/render.h"
#include "ui/ui.h"

/* ************************************************************************** */
static void
	rsp_respawn(t_game* game);
static void
	rsp_build_status_text(t_game* game, char* buf, int size);
static void
	rsp_build_result_text(t_game* game, char* title, int title_size, char* detail, int detail_size);
static void
	build_rsp_score_text(t_game* game, char* buf, int size);
static void
	rsp_clear_text_buffer(char* buf, int size);
t_mode_ops
	rsp_mode_ops(void);

/* ************************************************************************** */
// RSPでは所属チームに対応するスポーン地点へ復帰し、手も更新する
static void
	rsp_respawn(t_game* game)
{
	if (game->player->rsp.team == TEAM_BLUE) {
		respawn_at(game, RSP_BLUE_DIRS);
	} else {
		respawn_at(game, RSP_RED_DIRS);
	}
	game->player->rsp.hand = rsp_rehand(game->player->rsp.hand, &game->rsp.seed);
}


/* ************************************************************************** */
// RSPのHUDに表示するスコアテキストを組み立てる
static void
	rsp_build_status_text(t_game* game, char* buf, int size)
{
	build_rsp_score_text(game, buf, size);
}

/* ************************************************************************** */
// RSPの勝敗タイトルと最終スコアテキストを組み立てる
static void
	rsp_build_result_text(t_game* game, char* title, int title_size, char* detail, int detail_size)
{
	rsp_clear_text_buffer(title, title_size);
	if (game->rsp.winner == (int)game->player->rsp.team) {
		ft_write_str_n(title, title_size, "VICTORY", 0);
	} else {
		ft_write_str_n(title, title_size, "DEFEAT", 0);
	}
	build_rsp_score_text(game, detail, detail_size);
}

/* ************************************************************************** */
// RSPの赤青スコアを共通フォーマットでバッファへ書き込む
static void
	build_rsp_score_text(t_game* game, char* buf, int size)
{
	int	i;

	rsp_clear_text_buffer(buf, size);
	i = ft_write_str_n(buf, size, "Red ", 0);
	i = ft_write_int_n(buf, size, game->rsp.score[TEAM_RED], i);
	i = ft_write_str_n(buf, size, "/", i);
	i = ft_write_int_n(buf, size, RSP_SCORE_LIMIT, i);
	i = ft_write_str_n(buf, size, "  VS  Blue ", i);
	i = ft_write_int_n(buf, size, game->rsp.score[TEAM_BLUE], i);
	i = ft_write_str_n(buf, size, "/", i);
	ft_write_int_n(buf, size, RSP_SCORE_LIMIT, i);
}

/* ************************************************************************** */
// UI用の固定長バッファをゼロクリアする
static void
	rsp_clear_text_buffer(char* buf, int size)
{
	int	i;

	i = 0;
	while (i < size) {
		buf[i++] = 0;
	}
}

/* ************************************************************************** */
// RSPモードが common へ公開する操作テーブルを構築する
t_mode_ops
	rsp_mode_ops(void)
{
	t_mode_ops	ops = {0};

	ops.init_assets = init_hand_textures;
	ops.init_world = setup_rsp_combatants;
	ops.combat = resolve_rsp_combat;
	ops.respawn = rsp_respawn;
	ops.update_enemy = update_rsp_enemy;
	ops.draw_weapon = render_rsp_hand;
	ops.build_status_text = rsp_build_status_text;
	ops.build_result_text = rsp_build_result_text;
	ops.can_shoot = 0;
	return (ops);
}
