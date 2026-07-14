#ifndef KEYMAP_H
# define KEYMAP_H

/* ************************************************************************** */
// イベント種別の番号
# define EVENT_KEY_PRESS	2
# define EVENT_KEY_RELEASE	3
# define EVENT_EXPOSE		12
# define EVENT_EXIT			17

// 移動キー（WASDのみ）
# define KEY_W				119
# define KEY_A				97
# define KEY_S				115
# define KEY_D				100

// 回転キー（左右矢印）
# define KEY_LEFT			65361
# define KEY_RIGHT			65363

// 機能キー（終了・UI・影・照準）
# define KEY_ESC			65307
# define KEY_I				105
# define KEY_L				108
# define KEY_O				111

// 武器・アクションキー
# define KEY_NUM_1			49
# define KEY_NUM_2			50
# define KEY_NUM_3			51
# define KEY_SPACE			32

// ウィンドウイベントとイベントマスク
# define MASK_KEY_PRESS		(1L << 0)
# define MASK_KEY_RELEASE	(1L << 1)
# define MASK_CLOSE			(1L << 17)
# define MASK_EXPOSE		(1L << 15)

/* ************************************************************************** */

#endif
