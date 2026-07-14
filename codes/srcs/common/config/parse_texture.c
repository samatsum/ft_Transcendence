#include "config/config.h"

/* ************************************************************************** */
int
	parse_texture(t_config* config, int key, const char* line);
static int
	texture_index(int key);
static char*
	path_from_line(const char* line);

/* ************************************************************************** */
// テクスチャ設定を解析し、パスを保存する
int
	parse_texture(t_config* config, int key, const char* line)
{
	char*	path;
	int		index;

	index = texture_index(key);
	if (config->tex_path[index]) {
		free(config->tex_path[index]);
		config->tex_path[index] = NULL;
	}
	path = path_from_line(line);
	if (!path) {
		return (0);
	}
	config->tex_path[index] = path;
	return (1);
}

/* ************************************************************************** */
// 設定キーから保存先テクスチャスロットを1対1で求める
static int
	texture_index(int key)
{
	if (key == C_NO) {
		return (TEX_NORTH);
	} else if (key == C_SO) {
		return (TEX_SOUTH);
	} else if (key == C_WE) {
		return (TEX_WEST);
	} else if (key == C_EA) {
		return (TEX_EAST);
	} else if (key == C_ST) {
		return (TEX_SKY);
	} else if (key == C_FT) {
		return (TEX_FLOOR);
	} else if (key >= C_OI1 && key <= C_OI5) {
		return (TEX_IMP_1 + (key - C_OI1));
	} else if (key >= C_OP1 && key <= C_OP5) {
		return (TEX_PAS_1 + (key - C_OP1));
	} else if (key >= C_OC1 && key <= C_OC5) {
		return (TEX_COL_1 + (key - C_OC1));
	}
	return (TEX_IMP_1);
}

/* ************************************************************************** */
// 行から先頭キー(タグ)を読み飛ばし、テクスチャのパス部分を抽出する
static char*
	path_from_line(const char* line)
{
	int		start;
	int		end;

	if (!line) {
		return (NULL);
	}
	start = 0;
	while (line[start] && line[start] != ' ') {
		start++;
	}
	while (line[start] == ' ') {
		start++;
	}
	end = ft_strlen(line);
	while (end > start && line[end - 1] == ' ') {
		end--;
	}
	if (line[start] == '\0' || end - start <= 0) {
		return (NULL);
	}
	return (ft_substr(line, start, end - start));
}
