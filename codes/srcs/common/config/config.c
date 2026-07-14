#include <fcntl.h>  /* open, O_RDONLY 用 */
#include <unistd.h> /* close 用 */
#include "config/config.h"
#include "gnl/get_next_line.h" /* get_next_line 用 */
#include "config/defaults.h"

/* ************************************************************************** */
// 行頭キー文字列と種別の対応表。新しいキーはここに1行追加するだけでよい
typedef struct s_key_def
{
	const char*	tag;
	int			key;
}				t_key_def;

/* ************************************************************************** */
// 行頭キー文字列と種別の対応表。.cub で記述できる設定キーの一覧でもある。
// オブジェクトは各カテゴリ最大5種(OI1..OI5 等)。OI/OP/OC は旧1種目の別名
static const t_key_def	g_keys[] = {
	{"R", C_R},      // 解像度          : R 幅 高さ
	{"NO", C_NO},    // 壁テクスチャ    : 北向き (.xpm)
	{"SO", C_SO},    // 壁テクスチャ    : 南向き (.xpm)
	{"WE", C_WE},    // 壁テクスチャ    : 西向き (.xpm)
	{"EA", C_EA},    // 壁テクスチャ    : 東向き (.xpm)
	{"ST", C_ST},    // 天井テクスチャ  : 任意 (.xpm)
	{"FT", C_FT},    // 床テクスチャ    : 任意 (.xpm)
	{"F", C_F},      // 床の色          : F R,G,B（テクスチャ未指定時のフォールバック）
	{"C", C_C},      // 天井の色        : C R,G,B（テクスチャ未指定時のフォールバック）
	{"OI1", C_OI1},  // 通行不可 1種目  : 障害物テクスチャ (.xpm)
	{"OI2", C_OI2},  // 通行不可 2種目
	{"OI3", C_OI3},  // 通行不可 3種目
	{"OI4", C_OI4},  // 通行不可 4種目
	{"OI5", C_OI5},  // 通行不可 5種目
	{"OP1", C_OP1},  // 通行可   1種目  : 装飾テクスチャ (.xpm)
	{"OP2", C_OP2},  // 通行可   2種目
	{"OP3", C_OP3},  // 通行可   3種目
	{"OP4", C_OP4},  // 通行可   4種目
	{"OP5", C_OP5},  // 通行可   5種目
	{"OC1", C_OC1},  // 収集     1種目  : アイテムテクスチャ (.xpm)
	{"OC2", C_OC2},  // 収集     2種目
	{"OC3", C_OC3},  // 収集     3種目
	{"OC4", C_OC4},  // 収集     4種目
	{"OC5", C_OC5},  // 収集     5種目
	{"MS", C_MS},    // 移動速度        : 任意 (0 より大)
	{"RS", C_RS},    // 回転速度        : 任意 (0 より大)
	{"FOV", C_FOV},  // 視野角          : 任意 (大きいほど広角)
	{"ET", C_ET},    // 敵の追跡秒数    : 任意 (見失うまでの秒数)
	{"ES", C_ES},    // 敵の移動速度    : 任意 (0 より大, move_speed と独立)
	{"EH", C_EH},    // 敵のHP          : 任意 (0 より大の整数)
};

/* ************************************************************************** */
void
	init_config(t_config* config);
int
	clear_config(t_config* config);
int
	parse_config(t_config* config, const char* conf_path);
static int
	parse_line(t_config* config, const char* line, t_str** map_buffer, int* empty_map, int* cont_after);
static int
	config_key(const char* line);
static int
	tag_matches(const char* line, const char* tag);
static void
	strip_comment(char* line);

/* ************************************************************************** */
// 設定情報を既定値で初期化する。tex_path は全て NULL（テクスチャ未指定）、colors は
// テクスチャが無い面に使うフォールバック色、map は空。速度・FOV・敵パラメータは
// defaults.h の既定値を入れる。set[] は「そのキーが .cub に既出か」を表す重複検出
// フラグで、ここで全要素 0（未設定）に戻しておく
void
	init_config(t_config* config)
{
	int	i;

	config->requested_width = MIN_WIDTH;
	config->requested_height = MIN_HEIGHT;
	i = 0;
	while (i < TEXTURES) {
		config->tex_path[i++] = NULL;
	}
	config->colors[TEX_NORTH] = 0xFFFFFF;
	config->colors[TEX_SOUTH] = 0xCCCCCC;
	config->colors[TEX_WEST] = 0xFF44FF;
	config->colors[TEX_EAST] = 0x44FF44;
	config->colors[TEX_SKY] = 0x33C6E3;
	config->colors[TEX_FLOOR] = 0xA0764C;
	config->map.data = NULL;
	config->map.flags = NULL;
	config->map.rows = 0;
	config->map.columns = 0;
	config->rotate_speed = DEFAULT_ROTATE_SPEED;
	config->move_speed = DEFAULT_MOVE_SPEED;
	config->fov = DEFAULT_FOV;
	config->enemy_track_seconds = DEFAULT_ENEMY_TRACK_SECONDS;
	config->enemy_speed = DEFAULT_ENEMY_SPEED;
	config->enemy_hp = DEFAULT_ENEMY_HP;
	i = 0;
	while (i < C_LAST) {
		config->set[i++] = 0;
	}
}

/* ************************************************************************** */
// 設定が確保した動的メモリ（テクスチャパス文字列・マップ本体 data・セル属性フラグ層
// flags）を解放する。二重解放を防ぐため、解放後は各ポインタを NULL に戻す。戻り値 0 は
// 「失敗を表す 0」を呼び出し側がそのまま return できるようにするための慣用（常に 0 を返す）
int
	clear_config(t_config* config)
{
	int	i;

	i = 0;
	while (i < TEXTURES) {
		if (config->tex_path[i]) {
			free(config->tex_path[i]);
		}
		config->tex_path[i] = NULL;
		i++;
	}
	if (config->map.data) {
		free(config->map.data);
	}
	config->map.data = NULL;
	if (config->map.flags) {
		free(config->map.flags);
	}
	config->map.flags = NULL;
	return (0);
}

/* ************************************************************************** */
// 設定ファイル(.cub)を解析する本体。拡張子確認→オープン→get_next_line で1行ずつ
// 読み、strip_comment 後 parse_line で振り分け→蓄積したマップ行 map_buffer を最後に
// parse_map で確定、という流れ。r はここまでの解析が全て成功したかのフラグ、ret は
// get_next_line の戻り値（>0 継続 / 0 EOF / <0 読み取りエラー）。empty_map/cont_after は
// マップ後の空行を跨いで設定やマップ行が再出現する不正配置を検出するための状態。
// どの失敗経路でも map_buffer を str_clear で必ず解放してから抜ける
int
	parse_config(t_config* config, const char* conf_path)
{
	int		c_fd;
	int		ret;
	int		r;
	int		empty_map;
	int		cont_after;
	char*	line;
	t_str*	map_buffer;

	if (!ft_endswith(conf_path, ".cub")) {
		return (0);
	}
	c_fd = open(conf_path, O_RDONLY);
	if (c_fd < 0) {
		return (0);
	}
	map_buffer = NULL;
	r = 1;
	empty_map = 0;
	cont_after = 0;
	line = NULL;
	ret = get_next_line(c_fd, &line);
	while (ret > 0) {
		strip_comment(line);
		r = (r && parse_line(config, line, &map_buffer, &empty_map, &cont_after));
		free(line);
		line = NULL;
		ret = get_next_line(c_fd, &line);
	}
	close(c_fd);
	if (ret < 0) {
		r = 0;
	}
	if (!r) {
		return (str_clear(&map_buffer));
	}
	if (!parse_map(config, map_buffer)) {
		return (str_clear(&map_buffer));
	}
	str_clear(&map_buffer);
	return (1);
}

/* ************************************************************************** */
// 1行を種別ごとに振り分ける。空行はマップ開始後(set[C_MAP])なら empty_map を立て、
// さらにマップ後の空行を跨いで行が再出現したら(cont_after)不正配置として弾く。重複キー
// （既に set 済み）やマップ確定後の設定行も拒否する。R/テクスチャ/色/スカラーは各パーサへ
// 委譲し、それ以外（マップ本体）は ft_strdup して map_buffer 末尾に追加し後段の parse_map へ
// 渡す。最後の !! は str_add_back の戻り値ポインタを 0/1 の真偽値に正規化している
static int
	parse_line(t_config* config, const char* line, t_str** map_buffer, int* empty_map, int* cont_after)
{
	int	length;
	int	key;

	length = ft_strlen(line);
	if (length == 0 && config->set[C_MAP]) {
		*empty_map = 1;
	}
	if (*empty_map && *cont_after) {
		return (0);
	}
	if (length == 0) {
		return (1);
	}
	key = config_key(line);
	if (key != C_MAP && (config->set[key] || config->set[C_MAP])) {
		return (0);
	}
	if (key == C_R) {
		return (parse_dimensions(config, line));
	} else if (key >= C_NO && key <= C_ST) {
		return (parse_texture(config, key, line));
	} else if (key == C_F || key == C_C) {
		return (parse_color(config, key, line));
	} else if (key >= C_MS && key <= C_EH) {
		return (parse_scalar(config, key, line));
	}
	config->set[key] = 1;
	if (*empty_map) {
		*cont_after = 1;
	}
	return (!!str_add_back(map_buffer, ft_strdup(line)));
}

/* ************************************************************************** */
// 行頭トークンを g_keys の各タグと照合し、一致したキー種別を返す。どのタグにも一致
// しなければ C_MAP（＝マップ本体の行）とみなす。キー数は固定少数なので線形探索で十分
static int
	config_key(const char* line)
{
	size_t	i;

	i = 0;
	while (i < sizeof(g_keys) / sizeof(g_keys[0])) {
		if (tag_matches(line, g_keys[i].tag)) {
			return (g_keys[i].key);
		}
		i++;
	}
	return (C_MAP);
}

/* ************************************************************************** */
// 行頭が tag と前方一致し、かつ tag の直後がトークン境界（空白か行末）かを判定する。
// この境界チェックにより "N"(北スポーン) と "NO"(北テクスチャ) のような接頭辞の誤一致を防ぐ
static int
	tag_matches(const char* line, const char* tag)
{
	int	i;

	i = 0;
	while (tag[i]) {
		if (line[i] != tag[i]) {
			return (0);
		}
		i++;
	}
	return (line[i] == ' ' || line[i] == '\0');
}

/* ************************************************************************** */
// 行中の '#' 以降をコメントとして除去する。'#' が行頭か空白/タブの直後にある場合
// のみコメント開始と見なし、テクスチャパス途中の '#' は値の一部として残す
static void
	strip_comment(char* line)
{
	int	i;

	i = 0;
	while (line[i]) {
		if (line[i] == '#' && (i == 0 || line[i - 1] == ' ' || line[i - 1] == '\t')) {
			line[i] = '\0';
			return ;
		}
		i++;
	}
}
