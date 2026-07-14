#ifndef TYPES_H
# define TYPES_H

# include <sys/time.h>
# include "config/config.h"
# include "engine/input/input_state.h"
# include "engine/raycast/raycast.h"
# include "engine/render/render.h"
# include "enemy/enemy_types.h"

/* ************************************************************************** */
// 描画オプションの状態フラグ（UI・影・照準・懐中電灯）
# define FLAG_UI			0x00000010
# define FLAG_SHADOWS		0x00000100
# define FLAG_CROSSHAIR		0x00001000
# define FLAG_FLASHLIGHT	0x00010000

/* ************************************************************************** */
// 不完全構造体の前方宣言
typedef struct s_sprite		t_sprite;
typedef struct s_enemy		t_enemy;
typedef struct s_tex		t_tex;
typedef struct s_light		t_light;

// 装備中の武器の種別
typedef enum e_weapon_type
{
	WEP_PISTOL = 0,
	WEP_FLASHLIGHT,
	WEP_HANDS
}				t_weapon_type;

// ゲームモード（FPS=通常モード / RSP=じゃんけん鬼ごっこモード）
typedef enum e_game_mode
{
	MODE_FPS = 0,
	MODE_RSP
}				t_game_mode;

// モード別操作テーブル。各モードが自分の関数を登録し、common は間接呼び出しのみ行う
typedef struct s_mode_ops
{
	int		(*init_assets)(struct s_game* game);
	int		(*init_world)(struct s_game* game);
	void	(*combat)(struct s_game* game);
	void	(*respawn)(struct s_game* game);
	void	(*update_enemy)(t_enemy* enemy, struct s_game* game, double dt);
	void	(*draw_weapon)(struct s_game* game);
	void	(*build_status_text)(struct s_game* game, char* buf, int size);
	void	(*build_result_text)(struct s_game* game, char* title, int title_size, char* detail, int detail_size);
	int		can_shoot;
}				t_mode_ops;

// 武器・手のテクスチャ配列のインデックス
typedef enum e_weapon_tex_id
{
	WTEX_PISTOL_IDLE = 0,
	WTEX_PISTOL_SHOOT,
	WTEX_PISTOL_RECOIL,
	WTEX_FLASHLIGHT,
	WTEX_HAND_LEFT,
	WTEX_HAND_RIGHT,
	WEAPON_TEX_COUNT
}				t_weapon_tex_id;

// ゲーム世界の動的エンティティと収集進行状況
typedef struct s_world
{
	t_sprite*		sprites;
	t_enemy*		enemies;
	t_light*		lights;
	int				light_count;
	int				to_collect;
	int				collected;
}				t_world;

// 画像アセット（壁/床/天井・武器・敵・扉・死亡画面のテクスチャ群）。
// hand_tex は RSPモード専用で team * HAND_COUNT + hand の並びで引く6枚
// （Hand_<Team>_<Hand>.xpm）。FPSモードでは読み込まず未使用
typedef struct s_assets
{
	t_tex			tex[TEXTURES];
	t_tex			weapon_tex[WEAPON_TEX_COUNT];
	t_tex			enemy_tex[ENEMY_TEX_COUNT];
	t_tex			hand_tex[TEAM_COUNT * HAND_COUNT];
	t_tex			door_tex;
	t_tex			death_tex;
}				t_assets;

// 描画前計算のキャッシュ（カメラ平面比率・深度・床天井距離・回転三角関数）
typedef struct s_render_cache
{
	double			camera_x[MAX_WIDTH];
	double			depth[MAX_WIDTH];
	double			sf_dist[MAX_HEIGHT];
}				t_render_cache;

// フレーム制御用のタイミング情報
typedef struct s_timing
{
	long long		last_time;
}			t_timing;

// FPSモード専用の進行状態とアセット
typedef struct s_fps_data
{
	long long		clear_time_ms;
	t_tex			goal_tex;
}			t_fps_data;

// RSPモード専用の乱数、スコア、ホーム判定（プレイヤーの t_rsp_state は
// 戦闘員統合により game->player->rsp が正本になった）
typedef struct s_rsp_data
{
	unsigned int	seed;
	int				score[TEAM_COUNT];
	int				winner;
	int				on_home;
}			t_rsp_data;

// 各サブシステムを集約するファサード構造体。player は world.enemies リスト内の
// 自分の戦闘員（死亡演出タイマー・リスポーン地点はこのノードが持つ）。camera は
// player の位置・向きと毎フレーム同期する描画・移動計算用ビュー。
// fps / rsp はモード専用データを束ね、関係ないモードの状態へ触れる範囲を狭める。
// mode は e_game_mode の値（MODE_FPS / MODE_RSP）で、マップ配置ディレクトリで決まる
typedef struct s_game
{
	t_config		config;
	t_window		window;
	t_camera		camera;
	t_input			input;
	t_world			world;
	t_enemy*		player;
	t_assets		assets;
	t_render_cache	cache;
	t_timing		timing;
	t_fps_data		fps;
	t_rsp_data		rsp;
	long long		start_time_ms;
	int				cleared;
	int				result_screenshot_saved;
	int				options;
	int				last_options;
	int				mode;
	t_mode_ops		mode_ops;
}				t_game;

#endif
