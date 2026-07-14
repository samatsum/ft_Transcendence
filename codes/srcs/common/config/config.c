#include <fcntl.h>
#include <stdlib.h>
#include <unistd.h>

#include "config/config.h"
#include "config/defaults.h"

/* ************************************************************************** */
#define READ_CHUNK_SIZE 4096

/* ************************************************************************** */
// 行頭キー文字列と種別の対応表。新しいキーはここに1行追加するだけでよい
typedef struct s_key_def
{
	const char*	tag;
	int			key;
} 				t_key_def;

// メモリ上の .cub テキストを1行ずつ読むための薄いリーダ
typedef struct s_text_reader
{
	const char*	text;
	int			offset;
} 				t_text_reader;

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
int
	parse_config_text(t_config* config, const char* text);
static int
	read_file_text(const char* path, char** out);
static int
	append_chunk(char** text, int* used, const char* chunk, int size);
static int
	parse_config_reader(t_config* config, t_text_reader* reader);
static int
	read_text_line(t_text_reader* reader, char** line);
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
	config->spawn_count = 0;
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
// 設定ファイル(.cub)を全読みし、以後はメモリ上テキストの共通パーサへ渡す
int
	parse_config(t_config* config, const char* conf_path)
{
	char*	text;
	int		ok;

	if (!ft_endswith(conf_path, ".cub")) {
		return (0);
	}
	if (!read_file_text(conf_path, &text)) {
		return (0);
	}
	ok = parse_config_text(config, text);
	free(text);
	return (ok);
}

/* ************************************************************************** */
// メモリ上の .cub テキストを、行リーダ経由で既存の設定パーサへ流し込む
int
	parse_config_text(t_config* config, const char* text)
{
	t_text_reader	reader;

	if (!text) {
		return (0);
	}
	reader.text = text;
	reader.offset = 0;
	return (parse_config_reader(config, &reader));
}

/* ************************************************************************** */
// ファイル全体をNUL終端文字列として読み込む。native も以後はメモリリーダへ統一する
static int
	read_file_text(const char* path, char** out)
{
	char	chunk[READ_CHUNK_SIZE];
	char*	text;
	int		fd;
	int		used;
	ssize_t	read_size;

	*out = NULL;
	fd = open(path, O_RDONLY);
	if (fd < 0) {
		return (0);
	}
	text = (char*)malloc(1);
	if (!text) {
		close(fd);
		return (0);
	}
	text[0] = '\0';
	used = 0;
	read_size = read(fd, chunk, READ_CHUNK_SIZE);
	while (read_size > 0) {
		if (!append_chunk(&text, &used, chunk, (int)read_size)) {
			free(text);
			close(fd);
			return (0);
		}
		read_size = read(fd, chunk, READ_CHUNK_SIZE);
	}
	close(fd);
	if (read_size < 0) {
		free(text);
		return (0);
	}
	*out = text;
	return (1);
}

/* ************************************************************************** */
// 読み込んだチャンクを伸長済みテキストへ追記する
static int
	append_chunk(char** text, int* used, const char* chunk, int size)
{
	char*	next;
	int		i;

	next = (char*)malloc((size_t)(*used + size + 1));
	if (!next) {
		return (0);
	}
	i = 0;
	while (i < *used) {
		next[i] = (*text)[i];
		i++;
	}
	i = 0;
	while (i < size) {
		next[*used + i] = chunk[i];
		i++;
	}
	*used += size;
	next[*used] = '\0';
	free(*text);
	*text = next;
	return (1);
}

/* ************************************************************************** */
// メモリリーダから1行ずつ取り出し、コメント除去後に既存の行パーサへ渡す
static int
	parse_config_reader(t_config* config, t_text_reader* reader)
{
	int		ret;
	int		r;
	int		empty_map;
	int		cont_after;
	char*	line;
	t_str*	map_buffer;

	map_buffer = NULL;
	r = 1;
	empty_map = 0;
	cont_after = 0;
	line = NULL;
	ret = read_text_line(reader, &line);
	while (ret > 0) {
		strip_comment(line);
		r = (r && parse_line(config, line, &map_buffer, &empty_map, &cont_after));
		free(line);
		line = NULL;
		ret = read_text_line(reader, &line);
	}
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
// NUL終端テキストから次の1行を複製する。返す行には改行を含めない
static int
	read_text_line(t_text_reader* reader, char** line)
{
	int	start;
	int	length;
	int	i;

	*line = NULL;
	if (!reader->text[reader->offset]) {
		return (0);
	}
	start = reader->offset;
	while (reader->text[reader->offset] && reader->text[reader->offset] != '\n') {
		reader->offset++;
	}
	length = reader->offset - start;
	*line = (char*)malloc((size_t)length + 1);
	if (!*line) {
		return (-1);
	}
	i = 0;
	while (i < length) {
		(*line)[i] = reader->text[start + i];
		i++;
	}
	(*line)[length] = '\0';
	if (reader->text[reader->offset] == '\n') {
		reader->offset++;
	}
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
