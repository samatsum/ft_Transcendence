#ifndef INPUT_H
# define INPUT_H

# include "types.h"

/* ************************************************************************** */
// ウィンドウイベントおよびキー入力を制御するフック関数
int
	exit_hook(t_game* game);
int
	expose_hook(t_game* game);
int
	key_press(int keycode, t_game* game);
int
	key_release(int keycode, t_game* game);

#endif
