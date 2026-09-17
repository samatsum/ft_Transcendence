#ifndef INPUT_STATE_H
# define INPUT_STATE_H

# include "utils/utils.h"

/* ************************************************************************** */
// 入力状態（押下中キーに応じた移動・回転フラグと武器の状態）。
// t_game（外部入力の受け口）と t_enemy（戦闘員が保持する入力）の双方から
// 参照されるため、types.h ではなく独立ヘッダに置いて循環 include を避ける。
// is_shooting は native/web のローカルプレイヤー用の発射後カウンタ（モーション兼
// クールダウン）で、trigger はサーバの外部入力席が「引き金を引いているか」を表す
typedef struct s_input
{
	t_pos			move;
	t_pos			x_move;
	t_pos			rotate;
	int				current_weapon;
	int				is_shooting;
	int				trigger;
}				t_input;

#endif
