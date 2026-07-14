#ifndef CONFIG_H
# define CONFIG_H

/* ************************************************************************** */
# include <math.h> /* floor関数を使用するマクロ(FINT)のため */
# include "utils/utils.h"

/* ************************************************************************** */
// マップ解析で使用する方向文字と有効なマップ文字の集合
// （'a'〜'o' はオブジェクト3カテゴリ×5種）
# define DIRECTIONS				"NSEW"
# define VALID_MAP_CHARACTERS	" 01abcdefghijklmnoEWNSMPDG"

// ウィンドウ解像度の上限・下限（init時の既定要求サイズにも下限値を用いる）
# define MAX_WIDTH				1920
# define MAX_HEIGHT				1080
# define MIN_WIDTH				848
# define MIN_HEIGHT				480

// スポーン地点プールの最大数（N/S/E/W の総数の上限）
# define MAX_SPAWNS				64

// 色成分(R/G/B)入力の最大値
# define RGB_MAX				255

// 視野角(FOV)の調整スケールと最適アスペクト比
# define FOV_SCALE				2.5
# define BEST_RATIO				1.7777777778

// 座標の整数化・マップ範囲判定・マップ要素参照を行うマクロ群
# define FINT(x)				((int)floor(x))
# define CHECK_TOP(p)			(FINT(p.x) >= 0 && FINT(p.y) >= 0)
# define CHECK_BOT(p, c)		(FINT(p.x) < (c).map.columns && FINT(p.y) < (c).map.rows)
# define IN_MAP(p, c)			(CHECK_TOP(p) && CHECK_BOT(p, c))
# define MAP(p, c)				(c).map.data[(FINT(p.y) * (c).map.columns) + FINT(p.x)]
# define MAP_XY(x, y, c)		(c).map.data[(FINT(y) * (c).map.columns) + FINT(x)]

/* ************************************************************************** */
// セル属性フラグ層（map.data とは別レイヤ。起動時に一度だけ構築し以後不変。
// 訪問済みマーカー 'A' の data 上書きから P ロード等の静的属性を保護する）
// ビット0は将来の通行可フラグ用に予約
# define CELL_PATROL			(1 << 1)
# define FLAG_XY(x, y, c)		(c).map.flags[(FINT(y) * (c).map.columns) + FINT(x)]

/* ************************************************************************** */
// オブジェクトのマップ文字ブロック。カテゴリごとに連続した英小文字を割り当てる。
# define OBJ_PER_CATEGORY		5
# define IMP_FIRST				'a'
# define PAS_FIRST				'f'
# define COL_FIRST				'k'
// 扉のマップ文字。収集完了まで壁、完了後は床('0')へ書き換えて開放する
# define DOOR_CHAR				'D'
// FPSモードのゴール地点。通行可能で、踏むとクリア画面へ遷移する
# define GOAL_CHAR				'G'

/* ************************************************************************** */
// マップ文字 → 分類判定（オブジェクトの「意味」の定義はここだけが知っている）
# define IS_IMPASSABLE(c)	((c) >= IMP_FIRST && (c) < IMP_FIRST + OBJ_PER_CATEGORY)
# define IS_PASSABLE(c)		((c) >= PAS_FIRST && (c) < PAS_FIRST + OBJ_PER_CATEGORY)
# define IS_COLLECTIBLE(c)	((c) >= COL_FIRST && (c) < COL_FIRST + OBJ_PER_CATEGORY)
# define IS_DOOR(c)			((c) == DOOR_CHAR)
# define IS_GOAL(c)			((c) == GOAL_CHAR)
# define IS_OBJECT(c)		(IS_IMPASSABLE(c) || IS_PASSABLE(c) || IS_COLLECTIBLE(c))
# define IS_BLOCKING(c)		((c) == '1' || (c) == DOOR_CHAR || IS_IMPASSABLE(c))

# define IS_SPAWN(c)		((c) == 'N' || (c) == 'S' || (c) == 'E' || (c) == 'W')
# define IS_RED_SPAWN(c)	((c) == 'N' || (c) == 'W')
# define IS_BLUE_SPAWN(c)	((c) == 'S' || (c) == 'E')

/* ************************************************************************** */
// マップ文字 → テクスチャスロット番号（連番の t_texture_id を前提に算術で引く）
# define IMP_SLOT(c)		(TEX_IMP_1 + ((c) - IMP_FIRST))
# define PAS_SLOT(c)		(TEX_PAS_1 + ((c) - PAS_FIRST))
# define COL_SLOT(c)		(TEX_COL_1 + ((c) - COL_FIRST))
# define OBJ_SLOT(c)		(IS_IMPASSABLE(c) ? IMP_SLOT(c) : (IS_PASSABLE(c) ? PAS_SLOT(c) : COL_SLOT(c)))

/* ************************************************************************** */
// 設定ファイルの行種別キー（順序・値はパーサの範囲判定に依存するため変更不可。
// テクスチャ群 C_NO..C_ST（オブジェクト系 C_OI1..C_OC5 を含む）と
// スカラー群 C_MS..C_EH はそれぞれ連続させること。
// C_MAP はマップ本体、C_LAST は set[] の要素数を兼ねるため必ず末尾に置く）
typedef enum e_config_key
{
	C_R = 0,
	C_NO,
	C_SO,
	C_WE,
	C_EA,
	C_OI1,
	C_OI2,
	C_OI3,
	C_OI4,
	C_OI5,
	C_OP1,
	C_OP2,
	C_OP3,
	C_OP4,
	C_OP5,
	C_OC1,
	C_OC2,
	C_OC3,
	C_OC4,
	C_OC5,
	C_FT,
	C_ST,
	C_F,
	C_C,
	C_MS,
	C_RS,
	C_FOV,
	C_ET,
	C_ES,
	C_EH,
	C_MAP,
	C_LAST
}				t_config_key;

// テクスチャ／色配列のインデックス（TEXTURES は要素数を兼ねるため必ず末尾に置く。
// IMP/PAS/COL は各5枠を連続させること。OBJ_SLOT マクロが連番を前提とするため）
typedef enum e_texture_id
{
	TEX_NORTH = 0,
	TEX_SOUTH,
	TEX_WEST,
	TEX_EAST,
	TEX_SKY,
	TEX_FLOOR,
	TEX_IMP_1,
	TEX_IMP_2,
	TEX_IMP_3,
	TEX_IMP_4,
	TEX_IMP_5,
	TEX_PAS_1,
	TEX_PAS_2,
	TEX_PAS_3,
	TEX_PAS_4,
	TEX_PAS_5,
	TEX_COL_1,
	TEX_COL_2,
	TEX_COL_3,
	TEX_COL_4,
	TEX_COL_5,
	TEXTURES
}				t_texture_id;

// 1つのスポーン地点（マップ上の位置と向き文字 N/S/E/W）。N/S/E/W はマップに
// 複数あってよく、起動時に全て spawns[] へ収集する。move 系が踏んでも 'A' に
// 潰さないため、収集はいつ行ってもよい
typedef struct s_spawn_point
{
	t_pos	pos;
	char	dir;
}				t_spawn_point;

// マップ本体（1次元配列）とセル属性フラグ層、寸法を保持する構造体
typedef struct s_map
{
	int*			data;
	unsigned char*	flags;
	int				columns;
	int				rows;
}				t_map;

// 解像度・色・テクスチャパス・速度・マップなど全設定を集約する構造体
// （enemy_speed / enemy_hp は敵専用。move_speed とは独立に .cub の ES / EH で上書き）
typedef struct s_config
{
	char*			tex_path[TEXTURES];
	double			rotate_speed;
	double			move_speed;
	double			fov;
	double			enemy_track_seconds;
	double			enemy_speed;
	double			enemy_hp;
	unsigned int	requested_width;
	unsigned int	requested_height;
	unsigned int	colors[TEXTURES];
	int				set[C_LAST];
	t_spawn_point	spawns[MAX_SPAWNS];
	int				spawn_count;
	t_map			map;
}				t_config;

/* ************************************************************************** */
void
	init_config(t_config* config);
int
	clear_config(t_config* config);
int
	parse_dimensions(t_config* config, const char* line);
int
	parse_texture(t_config* config, int key, const char* line);
int
	parse_color(t_config* config, int key, const char* line);
int
	parse_scalar(t_config* config, int key, const char* line);
int
	parse_config(t_config* config, const char* conf_path);
int
	check_top_bottom_borders(t_str* map_buffer);
int
	check_left_right_borders(t_str* map_buffer);
int
	check_valid(t_config* config, t_str* map_buffer);
int
	parse_map(t_config* config, t_str* map_buffer);

#endif
