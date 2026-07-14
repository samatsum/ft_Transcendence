#include "core/core.h"
#include "core/mode_ops.h"
#include "core/respawn.h"
#include "enemy/enemy_utils.h"
#include "engine/render/render.h"
#include "ui/ui.h"

/* ************************************************************************** */
static int
	fps_init_noop(t_game* game);
static void
	fps_combat(t_game* game);
static void
	fps_respawn(t_game* game);
static void
	fps_build_status_text(t_game* game, char* buf, int size);
static void
	fps_build_result_text(t_game* game, char* title, int title_size, char* detail, int detail_size);
static void
	fps_clear_text_buffer(char* buf, int size);
static int
	write_two_digits(char* buf, int size, int val, int start);
t_mode_ops
	fps_mode_ops(void);

/* ************************************************************************** */
// FPSでは追加のモード専用初期化が不要なため、成功だけ返す
static int
	fps_init_noop(t_game* game)
{
	(void)game;
	return (1);
}

/* ************************************************************************** */
// FPSの戦闘処理として、敵との接触死亡判定を実行する
static void
	fps_combat(t_game* game)
{
	check_enemy_contact(game);
}

/* ************************************************************************** */
// FPSでは全スポーン方向からランダムに復帰する
static void
	fps_respawn(t_game* game)
{
	respawn_at(game, DIRECTIONS);
}


/* ************************************************************************** */
// FPSのHUDに表示する収集状況テキストを組み立てる
static void
	fps_build_status_text(t_game* game, char* buf, int size)
{
	int	i;

	fps_clear_text_buffer(buf, size);
	if (game->world.to_collect > 0 && game->world.to_collect == game->world.collected) {
		ft_write_str_n(buf, size, "ALL COLLECTED!", 0);
	} else if (game->world.to_collect > 0) {
		i = ft_write_str_n(buf, size, "Collect: ", 0);
		i = ft_write_str_n(buf, size, " / ", ft_write_int_n(buf, size, game->world.collected, i));
		ft_write_int_n(buf, size, game->world.to_collect, i);
	} else {
		ft_write_str_n(buf, size, "Nothing to collect !", 0);
	}
}

/* ************************************************************************** */
// FPSのクリア画面に表示する経過時間テキストを組み立てる
static void
	fps_build_result_text(t_game* game, char* title, int title_size, char* detail, int detail_size)
{
	int	i;
	int	total_seconds;
	int	minutes;
	int	seconds;

	fps_clear_text_buffer(title, title_size);
	fps_clear_text_buffer(detail, detail_size);
	total_seconds = (int)(game->fps.clear_time_ms / 1000);
	minutes = total_seconds / 60;
	seconds = total_seconds % 60;
	i = ft_write_str_n(title, title_size, "CLEAR TIME ", 0);
	i = ft_write_int_n(title, title_size, minutes, i);
	i = ft_write_str_n(title, title_size, "m ", i);
	i = write_two_digits(title, title_size, seconds, i);
	ft_write_str_n(title, title_size, "s", i);
}

/* ************************************************************************** */
// UI用の固定長バッファをゼロクリアする
static void
	fps_clear_text_buffer(char* buf, int size)
{
	int	i;

	i = 0;
	while (i < size) {
		buf[i++] = 0;
	}
}

/* ************************************************************************** */
// 0〜99 の値を2桁表記でバッファへ書き込む
static int
	write_two_digits(char* buf, int size, int val, int start)
{
	if (size > 0 && start < size - 1) {
		buf[start] = '0' + ((val / 10) % 10);
	}
	start++;
	if (size > 0 && start < size - 1) {
		buf[start] = '0' + (val % 10);
	}
	start++;
	if (size > 0 && start < size) {
		buf[start] = 0;
	} else if (size > 0) {
		buf[size - 1] = 0;
	}
	return (start);
}

/* ************************************************************************** */
// FPSモードが common へ公開する操作テーブルを構築する
t_mode_ops
	fps_mode_ops(void)
{
	t_mode_ops	ops = {0};

	ops.init_assets = fps_init_noop;
	ops.init_world = fps_init_noop;
	ops.combat = fps_combat;
	ops.respawn = fps_respawn;
	ops.update_enemy = update_fps_enemy;
	ops.draw_weapon = render_fps_weapon;
	ops.build_status_text = fps_build_status_text;
	ops.build_result_text = fps_build_result_text;
	ops.can_shoot = 1;
	return (ops);
}
