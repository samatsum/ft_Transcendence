#include "config/config.h"

/* ************************************************************************** */
int
	parse_map(t_config* config, t_str* map_buffer);
static int
	copy_map(t_config* config, t_str* map_buffer, int* map);
static int
	build_map_flags(t_config* config);

/* ************************************************************************** */
// マップ行バッファを検証し、整数配列 map.data とフラグ層 map.flags に確定する。
// 上下端の枠から列数(columns)、左右端の枠から行数(rows)を求め、2以下（枠だけで中身が
// 無い）か不正文字があれば失敗。malloc 後 copy_map でコピーし、その戻り値（カメラ＝
// スポーン文字 N/S/E/W の数）が 1 未満なら「スポーン無し」として失敗。data 確定後に
// build_map_flags で P マスの巡回フラグ層を作る。確保済み data は失敗時も呼び出し側の
// clear_config で解放されるため、ここでは二重 free しない
int
	parse_map(t_config* config, t_str* map_buffer)
{
	int*	map;

	map = NULL;
	config->map.columns = check_top_bottom_borders(map_buffer);
	config->map.rows = check_left_right_borders(map_buffer);
	if (config->map.columns <= 2 || config->map.rows <= 2 || !check_valid(config, map_buffer)) {
		return (0);
	}
	map = (int*)malloc(sizeof(*map) * (config->map.rows * config->map.columns));
	if (!map) {
		return (0);
	}
	if (copy_map(config, map_buffer, map) < 1) {
		free(map);
		return (0);
	}
	config->map.data = map;
	if (!build_map_flags(config)) {
		return (0);
	}
	return (1);
}

/* ************************************************************************** */
// マップ行リストを1次元 int 配列 map にコピーし、見つかったカメラ（スポーン文字
// N/S/E/W）の数を返す。各行で空白を読み飛ばしつつ1マスずつ格納し、line が列インデックス。
// 戻り値のカメラ数を呼び出し側が 1 未満＝スポーン無しとして弾くために使う
static int
	copy_map(t_config* config, t_str* map_buffer, int* map)
{
	int i;
	int j;
	int line;
	int has_camera;

	i = 0;
	has_camera = 0;
	while (map_buffer) {
		j = 0;
		line = 0;
		while (map_buffer->content[j]) {
			while (map_buffer->content[j] == ' ') {
				j++;
			}
			map[(i * config->map.columns) + line++] = map_buffer->content[j];
			if (ft_in_set(map_buffer->content[j], DIRECTIONS)) {
				has_camera++;
			}
			j++;
		}
		map_buffer = map_buffer->next;
		i++;
	}
	return (has_camera);
}

/* ************************************************************************** */
// マップ本体 data と同要素数のフラグ層 flags を確保し、各マスの静的属性を記録する。
// 現状は 'P'（巡回ポイント）のマスに CELL_PATROL ビットを立てるのみ。data とは別レイヤに
// することで、移動時の訪問済みマーカー等が data を上書きしても静的属性が壊れないようにする
static int
	build_map_flags(t_config* config)
{
	unsigned char*	flags;
	int				total;
	int				i;

	total = config->map.rows * config->map.columns;
	flags = (unsigned char*)malloc(sizeof(*flags) * total);
	if (!flags) {
		return (0);
	}
	i = 0;
	while (i < total) {
		if (config->map.data[i] == 'P') {
			flags[i] = CELL_PATROL;
		} else {
			flags[i] = 0;
		}
		i++;
	}
	config->map.flags = flags;
	return (1);
}
