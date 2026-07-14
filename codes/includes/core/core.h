#ifndef CORE_H
# define CORE_H

# include "types.h"

/* ************************************************************************** */
// ゲーム全体のライフサイクルおよび主要ロジックを制御する公開関数
int
	main_loop(t_game* game);
int
	game_frame(t_game* game, double delta_time);
void
	game_step(t_game* game, double delta_time);
double
	calc_time_mult(double delta_time);
long long
	get_current_time_ms(void);
void
	init_game(t_game* game);
int
	finish_init(t_game* game);
void
	load_player_assets(t_game* game);
int
	exit_game(t_game* game, int code);
int
	exit_error(t_game* game, const char* str);
int
	save_result_screenshot(t_game* game);
void
	check_quest(t_game* game);
void
	count_items(t_game* game);
void
	shoot_target(t_game* game);

#endif
