#ifndef ENEMY_TYPES_H
# define ENEMY_TYPES_H

# include "engine/input/input_state.h"
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

// 戦闘員の入力源。AI はモード別 AI が操作を決め、EXTERNAL は外部入力
// （native のキーボード、将来は WS 経由のリモート入力）が t_input を供給する
typedef enum e_input_source
{
	INPUT_SRC_AI = 0,
	INPUT_SRC_EXTERNAL
}				t_input_source;

/* ************************************************************************** */
// 戦闘員（プレイヤー・NPC 共通）の実体と状態を管理する構造体。
// input_source/input/is_player/radius/death_timer/spawn は戦闘員統合（G-02〜04）で
// 追加: プレイヤーも world.enemies リストの1ノードになり、入力源だけが違う。
// is_player のノードの sprite は描画リスト（world.sprites）へ繋がない（自分の
// 身体は描かないため）。patrol_* は巡回モードの歩行状態、path[] は追跡経路
// キャッシュ。rsp は RSPモード専用の状態（team/hand/spawn/alive）。案Xにより
// common の共有モデルへ直接埋め込んでいる
typedef struct s_enemy
{
	int				hp;
	int				state;
	int				patrol_active;
	int				path_valid;
	int				path_len;
	int				path_idx;
	int				input_source;
	int				is_player;
	double			radius;
	double			death_timer;
	double			dir_angle;
	double			track_timer;
	t_input			input;
	t_camera		spawn;
	t_pos			patrol_from;
	t_pos			patrol_target;
	t_pos			path_goal;
	t_pos			path[PATH_MAX];
	t_sprite*		sprite;
	t_rsp_state		rsp;
	struct s_enemy*	next;
}	t_enemy;

#endif
