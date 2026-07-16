#ifndef CORE_H
# define CORE_H

# include "types.h"

/* ************************************************************************** */
// ゲーム全体のライフサイクルおよび主要ロジックを制御する公開関数。
// game_step は sim 公開 API（① §3-B）を兼ね、1 の戻り値で決着済みを表す
int
	main_loop(t_game* game);
int
	game_frame(t_game* game, double delta_time);
int
	game_step(t_game* game, double delta_time);
void
	step_external_combatants(t_game* game, double time_mult);
double
	calc_time_mult(double delta_time);
long long
	get_current_time_ms(void);
void
	init_game(t_game* game);
int
	finish_init(t_game* game);
int
	scan_world_sprites(t_game* game);
void
	load_player_assets(t_game* game);
int
	exit_game(t_game* game, int code);
int
	exit_error(t_game* game, const char* str);
void
	clear_assets(t_game* game);
int
	save_result_screenshot(t_game* game);
void
	check_quest(t_game* game);
void
	count_items(t_game* game);
void
	shoot_target(t_game* game);

#endif
