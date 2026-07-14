#include <stdlib.h>

#include "config/config.h"
#include "enemy/enemy.h"
#include "enemy/enemy_utils.h"

/* ************************************************************************** */
int
	bfs_fill_path(t_config* config, int sx, int sy, int gx, int gy, t_pos* path);
int
	bfs_to_nearest_patrol(t_config* config, int sx, int sy, t_pos* next);
static int
	bfs_explore(t_config* config, int start_idx, int goal_idx, int* came);
static int
	cell_walkable(t_config* config, int x, int y);

/* ************************************************************************** */
// BFSで最短経路を全探索し、始点から終点までのマス列を path[] に前方順で格納する。探索本体は
// bfs_explore に委譲し、ここでは came[] から終点→始点を逆向きに辿って path を組む。経路長が
// PATH_MAX を超える場合は始点側の先頭 PATH_MAX マスだけを保持する
int
	bfs_fill_path(t_config* config, int sx, int sy, int gx, int gy, t_pos* path)
{
	int		cols;
	int		start_idx;
	int		cur_idx;
	int		len;
	int		f;
	int*	came;

	cols = config->map.columns;
	came = (int*)malloc(sizeof(int) * (cols * config->map.rows));
	if (!came) {
		return (0);
	}
	start_idx = (sy * cols) + sx;
	cur_idx = bfs_explore(config, start_idx, (gy * cols) + gx, came);
	if (cur_idx < 0) {
		free(came);
		return (0);
	}
	len = 1;
	while (cur_idx != start_idx) {
		cur_idx = came[cur_idx];
		len++;
	}
	cur_idx = (gy * cols) + gx;
	f = len - 1;
	while (f >= 0) {
		if (f < PATH_MAX) {
			set_pos(&path[f], cur_idx % cols, cur_idx / cols);
		}
		cur_idx = came[cur_idx];
		f--;
	}
	free(came);
	if (len > PATH_MAX) {
		return (PATH_MAX);
	}
	return (len);
}

/* ************************************************************************** */
// BFSで始点から最も近い Pロード セルを探し(bfs_explore に委譲)、始点の次に進むべき1マスを返す。
// came[] を発見セルから始点直前まで逆に辿り、その1つ手前のマスが「次の1歩」になる
int
	bfs_to_nearest_patrol(t_config* config, int sx, int sy, t_pos* next)
{
	int		cols;
	int		start_idx;
	int		cur_idx;
	int*	came;

	cols = config->map.columns;
	came = (int*)malloc(sizeof(int) * (cols * config->map.rows));
	if (!came) {
		return (0);
	}
	start_idx = (sy * cols) + sx;
	cur_idx = bfs_explore(config, start_idx, -1, came);
	if (cur_idx < 0) {
		free(came);
		return (0);
	}
	while (came[cur_idx] != start_idx) {
		cur_idx = came[cur_idx];
	}
	set_pos(next, cur_idx % cols, cur_idx / cols);
	free(came);
	return (1);
}

/* ************************************************************************** */
// 幅優先探索の中核。start_idx から探索して came[](呼び出し側が確保)に親リンクを埋め、停止した
// セルの添字を返す。goal_idx>=0 ならそのセル、goal_idx<0 なら最初の CELL_PATROL セルで停止する。
// 未到達は -1、作業用 queue の malloc 失敗も -1。2系統の経路探索が探索ループと近傍展開を共有する
static int
	bfs_explore(t_config* config, int start_idx, int goal_idx, int* came)
{
	static const int	off_x[4] = {1, -1, 0, 0};
	static const int	off_y[4] = {0, 0, 1, -1};
	int					cols;
	int					head;
	int					tail;
	int					i;
	int					cur;
	int					nx;
	int					ny;
	int*				queue;

	cols = config->map.columns;
	queue = (int*)malloc(sizeof(int) * (cols * config->map.rows));
	if (!queue) {
		return (-1);
	}
	i = 0;
	while (i < cols * config->map.rows) {
		came[i++] = -1;
	}
	came[start_idx] = start_idx;
	head = 0;
	tail = 0;
	queue[tail++] = start_idx;
	while (head < tail) {
		cur = queue[head++];
		if ((goal_idx >= 0 && cur == goal_idx)
			|| (goal_idx < 0 && (config->map.flags[cur] & CELL_PATROL))) {
			free(queue);
			return (cur);
		}
		i = 0;
		while (i < 4) {
			nx = (cur % cols) + off_x[i];
			ny = (cur / cols) + off_y[i];
			if (cell_walkable(config, nx, ny) && came[(ny * cols) + nx] == -1) {
				came[(ny * cols) + nx] = cur;
				queue[tail++] = (ny * cols) + nx;
			}
			i++;
		}
	}
	free(queue);
	return (-1);
}

/* ************************************************************************** */
// 指定セルがマップ範囲内かつ壁・通行不可オブジェクトでない(通行可)かを判定する
static int
	cell_walkable(t_config* config, int x, int y)
{
	if (x < 0 || y < 0 || x >= config->map.columns || y >= config->map.rows) {
		return (0);
	}
	return (!IS_BLOCKING(config->map.data[(y * config->map.columns) + x]));
}
