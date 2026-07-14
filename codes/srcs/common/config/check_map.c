#include "config/config.h"

/* ************************************************************************** */
static int
	count_check_columns(const char* line);
int
	check_top_bottom_borders(t_str* map_buffer);
int
	check_left_right_borders(t_str* map_buffer);
int
	check_valid(t_config* config, t_str* map_buffer);

/* ************************************************************************** */
// 枠行（上端・下端）に含まれる '1' の個数を数えて返す。'1' と空白以外の文字が混じって
// いれば 0 を返して不正とする（枠行は壁 '1' と空白のみで構成されるべきだから）
static int
	count_check_columns(const char* line)
{
	int	i;
	int	j;

	i = 0;
	j = 0;
	while (line[i]) {
		if (line[i] == '1') {
			j++;
		} else if (line[i] != ' ') {
			return (0);
		}
		i++;
	}
	return (j);
}

/* ************************************************************************** */
// マップ上端行と下端行が枠として正しいかを検査し、正しければ列数（＝枠行の '1' の数）を
// 返す。先頭行と最終行の '1' 数が一致する場合のみその値を返し、不一致や不正文字なら 0。
// この戻り値がそのまま config.map.columns になる
int
	check_top_bottom_borders(t_str* map_buffer)
{
	int		first_line;
	int		last_line;
	t_str*	last;

	if (!map_buffer) {
		return (0);
	}
	first_line = count_check_columns(map_buffer->content);
	last = str_last(map_buffer);
	if (last) {
		last_line = count_check_columns(last->content);
	} else {
		last_line = 0;
	}
	if (first_line == last_line) {
		return (first_line);
	}
	return (0);
}

/* ************************************************************************** */
// 全行の左端・右端が壁 '1' で閉じているかを検査し、正しければ行数を返す（config.map.rows に
// なる）。各行で前後の空白を除いた最初と最後の文字を見て、どちらかが '1' でない、または
// 実質長さが短すぎる(last<=1)行があれば 0 を返す。i は走査した行数のカウンタ
int
	check_left_right_borders(t_str* map_buffer)
{
	int	i;
	int	first;
	int	last;

	if (!map_buffer) {
		return (0);
	}
	i = 0;
	while (map_buffer) {
		first = 0;
		while (map_buffer->content[first] == ' ') {
			first++;
		}
		last = ft_strlen(map_buffer->content) - 1;
		while (last > 0 && map_buffer->content[last] == ' ') {
			last--;
		}
		if (last <= 1 || map_buffer->content[first] != '1' || map_buffer->content[last] != '1') {
			return (0);
		}
		map_buffer = map_buffer->next;
		i++;
	}
	return (i);
}

/* ************************************************************************** */
// マップ全行が VALID_MAP_CHARACTERS のみで構成され、かつ各行の有効マス数（空白を除いた
// 列数）が columns と一致するかを検査する。不正文字か列数不一致があれば 0、全行 OK なら 1
int
	check_valid(t_config* config, t_str* map_buffer)
{
	int	i;
	int	col;

	while (map_buffer) {
		i = 0;
		col = 0;
		while (map_buffer->content[i]) {
			if (!ft_in_set(map_buffer->content[i], VALID_MAP_CHARACTERS)) {
				return (0);
			}
			if (map_buffer->content[i++] != ' ') {
				col++;
			}
		}
		if (col != config->map.columns) {
			return (0);
		}
		map_buffer = map_buffer->next;
	}
	return (1);
}
