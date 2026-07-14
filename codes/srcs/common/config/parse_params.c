#include <stddef.h>            /* offsetof 用 */
#include "config/config.h"
#include "tuning.h"

/* ************************************************************************** */
// 上書き可能なスカラー設定のレジストリ（キー→t_configフィールド→許容範囲）。
// 新しいスカラー設定を増やすときは、この配列に1行追加し、対応キーを enum と
// config_key に足すだけでよい（パーサ本体の分岐を増やす必要はない）。
// enemy_hp は double で受け、生成時に int へ縮小する（範囲検証は下限 0 超のみ）
typedef struct s_scalar_def
{
	int		key;
	double	min_exclusive;
	double	max_inclusive;
	size_t	field_off;
}				t_scalar_def;

static const t_scalar_def	g_scalars[] = {
	{C_MS, 0.0, 100.0, offsetof(t_config, move_speed)},
	{C_RS, 0.0, 100.0, offsetof(t_config, rotate_speed)},
	{C_FOV, 0.0, 10.0, offsetof(t_config, fov)},
	{C_ET, 0.0, 3600.0, offsetof(t_config, enemy_track_seconds)},
	{C_ES, 0.0, 100.0, offsetof(t_config, enemy_speed)},
	{C_EH, 0.0, 100000.0, offsetof(t_config, enemy_hp)},
};

/* ************************************************************************** */
int
	parse_dimensions(t_config* config, const char* line);
int
	parse_color(t_config* config, int key, const char* line);
int
	parse_scalar(t_config* config, int key, const char* line);
static int
	str_to_color(t_str* str);
static const t_scalar_def*
	find_scalar(int key);
static double
	parse_double(const char* s, int* ok);

/* ************************************************************************** */
// 解像度設定 "R 幅 高さ" を解析する。まず 'R' の次以降が空白か数字だけで構成されるかを
// 検査し、不正文字があれば失敗。次に空白で分割して必ず3トークン（R/幅/高さ）であることを
// 確認し、幅・高さを ft_atoi で取得。1 以下は無効値として弾く。t_str リストはどの経路でも
// str_clear で解放する（解放漏れ防止のため各 return 前に明示的に呼ぶ）
int
	parse_dimensions(t_config* config, const char* line)
{
	int		i;
	int		tmp;
	t_str*	str;
	t_str*	param;

	// 先頭の 'R' を ++i で飛ばし(i=1 から)、残りに空白でも数字でもない文字があれば失敗。
	// 条件は「空白でない、かつ('0'未満 または '9'超)」＝数字でも空白でもない文字の検出。
	// （&& と || の優先順位に注意：|| を括弧で括らないと検査が常に偽になり機能しない）
	i = 0;
	while (line[++i]) {
		if (line[i] != ' ' && (line[i] < '0' || line[i] > '9')) {
			return (0);
		}
	}
	str = ft_split(line, ' ');
	if (!str || str_length(str) != 3) {
		str_clear(&str);
		return (0);
	}
	param = str->next;
	tmp = ft_atoi(param->content);
	if (tmp <= 1) {
		str_clear(&str);
		return (0);
	}
	config->requested_width = tmp;
	param = param->next;
	tmp = ft_atoi(param->content);
	if (tmp <= 1) {
		str_clear(&str);
		return (0);
	}
	config->requested_height = tmp;
	str_clear(&str);
	return (1);
}

/* ************************************************************************** */
// 色設定 "F R,G,B"（床）/ "C R,G,B"（天井）を解析する。先頭キーの次以降が空白・カンマ・
// 数字のみかを検査し、まず空白で2分割（キーと "R,G,B"）、続けてカンマで3分割して
// str_to_color で 0xRRGGBB に合成。範囲外(<0)は失敗。key が C_F なら床色、それ以外(C_C)は
// 天井色へ格納。str_arr[0]=空白分割, str_arr[1]=カンマ分割で、全経路で両方を str_clear する
int
	parse_color(t_config* config, int key, const char* line)
{
	int				i;
	unsigned int	color;
	t_str*			str_arr[2];

	i = 1;
	while (line[i]) {
		if (!ft_in_set(line[i++], " ,0123456789")) {
			return (0);
		}
	}
	str_arr[0] = NULL;
	str_arr[1] = NULL;
	str_arr[0] = ft_split(line, ' ');
	if (!str_arr[0] || str_length(str_arr[0]) != 2) {
		str_clear(&str_arr[0]);
		str_clear(&str_arr[1]);
		return (0);
	}
	str_arr[1] = ft_split(str_arr[0]->next->content, ',');
	if (!str_arr[1] || str_length(str_arr[1]) != 3) {
		str_clear(&str_arr[0]);
		str_clear(&str_arr[1]);
		return (0);
	}
	color = (unsigned int)str_to_color(str_arr[1]);
	if ((int)color < 0) {
		str_clear(&str_arr[0]);
		str_clear(&str_arr[1]);
		return (0);
	}
	if (key == C_F) {
		config->colors[TEX_FLOOR] = color;
	} else {
		config->colors[TEX_SKY] = color;
	}
	str_clear(&str_arr[0]);
	str_clear(&str_arr[1]);
	return (1);
}

/* ************************************************************************** */
// .cub のスカラー設定(MS/RS/FOV/ET/ES/EH)を解析し、対応フィールドを上書きする。レジストリ
// g_scalars からキーの定義（許容範囲とフィールドのオフセット）を引き、行頭の英字キーを飛ばして
// 残りが空白・小数点・数字のみかを検査。自作の parse_double で数値化し、数字を1つも消費しなければ
// (ok==0)失敗、範囲外(min_exclusive 以下／max_inclusive 超)も失敗。書き込みは config 先頭から
// field_off バイトずらした位置へ double として代入する（フィールドごとの分岐を不要にする方式）
int
	parse_scalar(t_config* config, int key, const char* line)
{
	const t_scalar_def*	def;
	double				value;
	int					ok;
	int					start;
	int					i;

	def = find_scalar(key);
	if (!def) {
		return (0);
	}
	start = 0;
	while ((line[start] >= 'A' && line[start] <= 'Z')
		|| (line[start] >= 'a' && line[start] <= 'z')) {
		start++;
	}
	i = start;
	while (line[i]) {
		if (!ft_in_set(line[i], " .0123456789")) {
			return (0);
		}
		i++;
	}
	value = parse_double(line + start, &ok);
	if (!ok || value <= def->min_exclusive || value > def->max_inclusive) {
		return (0);
	}
	*(double*)((char*)config + def->field_off) = value;
	return (1);
}

/* ************************************************************************** */
// "R","G","B" の3要素文字列リストを 0xRRGGBB の整数へ合成する。各成分を ft_atoi で数値化し、
// 0..RGB_MAX(255) の範囲外なら -1（エラー）を返す。i 番目を (16 - i*8) ビット左シフトして
// R=16bit, G=8bit, B=0bit の位置に OR で重ねる。戻り値が int のため、呼び出し側は <0 で失敗判定
// する（有効色 0x000000〜0xFFFFFF は全て非負なので -1 と区別できる）
static int
	str_to_color(t_str* str)
{
	int	i;
	int	color;
	int	tmp;

	i = 0;
	color = 0;
	while (str) {
		tmp = ft_atoi(str->content);
		if (tmp < 0 || tmp > RGB_MAX) {
			return (-1);
		}
		color = color | (tmp << (16 - (i++ * 8)));
		str = str->next;
	}
	return (color);
}

/* ************************************************************************** */
// キーに対応するスカラー設定の定義を g_scalars レジストリから線形検索する。見つからなければ
// NULL を返し、呼び出し側(parse_scalar)はそれを失敗として扱う
static const t_scalar_def*
	find_scalar(int key)
{
	size_t	i;

	i = 0;
	while (i < sizeof(g_scalars) / sizeof(g_scalars[0])) {
		if (g_scalars[i].key == key) {
			return (&g_scalars[i]);
		}
		i++;
	}
	return (NULL);
}

/* ************************************************************************** */
// strtod の代替（許可関数のみで構成するための自作版）。先頭の空白を読み飛ばし、整数部と
// 小数部の数字を10進で積む。符号・指数は扱わない（呼び出し前に " .0123456789" のみへ制限
// 済みのため不要）。数字を1つも消費しなければ *ok=0（＝変換失敗、strtod の endptr 不進に相当）、
// 1つでも消費すれば *ok=1 とし、解析した数値を返す
static double
	parse_double(const char* s, int* ok)
{
	double	result;
	double	scale;

	*ok = 0;
	while (*s == ' ') {
		s++;
	}
	result = 0.0;
	while (*s >= '0' && *s <= '9') {
		result = result * 10.0 + (*s - '0');
		*ok = 1;
		s++;
	}
	if (*s == '.') {
		s++;
		scale = 0.1;
		while (*s >= '0' && *s <= '9') {
			result += (*s - '0') * scale;
			scale *= 0.1;
			*ok = 1;
			s++;
		}
	}
	return (result);
}
