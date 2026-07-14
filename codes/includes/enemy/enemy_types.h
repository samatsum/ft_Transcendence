#ifndef ENEMY_TYPES_H
# define ENEMY_TYPES_H

# include "engine/render/render.h"
# include "rsp/rsp.h"

/* ************************************************************************** */
// 経路キャッシュが保持できる最大マス数。最短経路がこれを超える場合は始点側の
// 先頭このマス数だけを保持し、敵が使い切った時点で現在地から再計算する（挙動は
// 不変で再計算頻度のみ増える）。1マスあたり t_pos(16B) を消費する点に注意
# define PATH_MAX			1024

/* ************************************************************************** */
// 敵の行動状態
typedef enum e_enemy_state
{
	ENEMY_STATE_IDLE = 0,
	ENEMY_STATE_WALK,
	ENEMY_STATE_DEAD,
	ENEMY_STATE_PATROL
}				t_enemy_state;

// 敵テクスチャ配列の要素数（8方向ぶん。個々の要素は角度から算術的に参照される
// ため、方向名は付けず要素数のみを型付き定数として保持する）
typedef enum e_enemy_tex_id
{
	ENEMY_TEX_COUNT = 8
}				t_enemy_tex_id;

/* ************************************************************************** */
// 敵の実体と状態を管理する専用構造体（patrol_* は巡回モードの歩行状態、
// path[] は追跡経路キャッシュ。path_idx が次に向かうマスの添字、path_goal は
// 経路計算時のプレイヤーセル。プレイヤーがセルをまたぐまで再計算しない）。
// rsp は RSPモード専用の状態（team/hand/spawn/alive）。案Xにより common の
// 共有モデルへ直接埋め込んでいる。FPSモードでは未使用。将来 common を rsp 型に
// 依存させない方針（案Y）へ移すなら、この1メンバを外部テーブルへ剥がす
typedef struct s_enemy
{
	int				hp;
	int				state;
	int				patrol_active;
	int				path_valid;
	int				path_len;
	int				path_idx;
	double			dir_angle;
	double			track_timer;
	t_pos			patrol_from;
	t_pos			patrol_target;
	t_pos			path_goal;
	t_pos			path[PATH_MAX];
	t_sprite*		sprite;
	t_rsp_state		rsp;
	struct s_enemy*	next;
}	t_enemy;

#endif
