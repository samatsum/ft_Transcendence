#include "gnl/get_next_line.h"  /* 自身の宣言・補助関数・t_fd / t_str・BUFFER_SIZE のため */

/* ************************************************************************** */
int
	get_next_line(int fd, char** line);
static int
	read_file_until_nl(t_str** str, int fd);
static int
	malloc_next_line(t_str** str, char** line);
static int
	write_next_line(t_str** str, char** line);
static int
	gnl_clear(t_fd** list, int fd, char** line);
static int
	free_all(t_fd** list, int fd, char* buf);

/* ************************************************************************** */
// fd から1行を読み出して *line に返す公開関数。成功:1 / 終端:0 / エラー:負(終端・エラー時は
// *line を NULL 化)。static リスト list に fd ごとの読み残しバッファを保持し、複数 fd を跨いでも
// 取り違えない。手順は (1)引数検証 (2)fd ノードを探す/作る (3)改行が未バッファなら読み足す
// (4)行長ぶん確保 (5)バッファから1行書き出す。改行を消費せず空行になったら真の EOF として
// fd 状態を解放し 0 を返す。各失敗経路は gnl_clear に集約し、リーク無く -1 を返す
int
	get_next_line(int fd, char** line)
{
	static t_fd*	list = NULL;
	t_fd*			current;
	int				is_new;
	int				r;

	if (fd < 0 || !line || BUFFER_SIZE <= 0) {
		return (gnl_clear(&list, fd, line));
	}
	*line = NULL;
	current = find_fd(&list, fd, &is_new);
	if (!current) {
		return (gnl_clear(&list, -1, line));
	}
	if (is_new || !current->str || !find_nl(current->str, NULL)) {
		r = read_file_until_nl(&current->str, fd);
		if (r < 0) {
			return (gnl_clear(&list, (r == -1) ? -1 : fd, line));
		}
	}
	if (!malloc_next_line(&current->str, line)) {
		return (gnl_clear(&list, -1, line));
	}
	r = write_next_line(&current->str, line);
	if (r == 0 && ft_strlen(*line) == 0) {
		free(*line);
		*line = NULL;
		free_all(&list, fd, NULL);
		return (0);
	}
	return (1);
}

/* ************************************************************************** */
// 改行が現れるまで(または EOF/エラーまで)読み込みを繰り返し、チャンクをリスト str へ蓄える。
// 成功:1 / 自身の scratch バッファ malloc 失敗:-1 / read 失敗:-2。直近に読んだバッファに改行が
// 出た時点で打ち切るので、行をまたいで余分に読み込まない。scratch は必ず解放してから返す
static int
	read_file_until_nl(t_str** str, int fd)
{
	char*	buffer;
	int		r;

	buffer = (char*)malloc(sizeof(*buffer) * (BUFFER_SIZE + 1));
	if (!buffer) {
		return (-1);
	}
	while ((r = read_file(str, buffer, fd)) > 0) {
		if (find_nl(NULL, buffer)) {
			break ;
		}
	}
	free(buffer);
	if (r < 0) {
		return (-2);
	}
	return (1);
}

/* ************************************************************************** */
// 次の1行を格納するのに必要なメモリを確保する。バッファリストを走査して最初の '\n' までの
// 文字数 j を数え(改行を含む長さ)、j+1 バイト確保して末尾を NUL 終端する。走査で進めた *str は
// 先頭 first へ戻す。成功:1 / malloc 失敗:0
static int
	malloc_next_line(t_str** str, char** line)
{
	t_str*	first;
	int		i;
	int		j;
	char*	buffer;

	first = *str;
	j = 0;
	while (*str) {
		i = 0;
		while ((*str)->content[i] && (*str)->content[i] != '\n') {
			i++;
			j++;
		}
		if ((*str)->content[i] == '\n') {
			break ;
		}
		*str = (*str)->next;
	}
	*str = first;
	buffer = (char*)malloc(sizeof(*buffer) * (j + 1));
	if (!buffer) {
		return (0);
	}
	*line = buffer;
	(*line)[j] = 0;
	return (1);
}

/* ************************************************************************** */
// 確保済みの line へ、バッファチャンクから1行ぶんを書き写す。改行に達したらそれを消費し(戻り値
// 1)、改行より後ろの残りを同チャンク先頭へ詰め直して次回呼び出しに残す。改行前に使い切った
// チャンクは順次解放する。改行が無いまま尽きたら 0(末尾改行なしの最終行や EOF を表す)
static int
	write_next_line(t_str** str, char** line)
{
	int		idx0;
	int		idx1;
	int		remaining;
	t_str*	next;

	idx1 = 0;
	remaining = 0;
	while (*str) {
		idx0 = 0;
		while ((*str)->content[idx0] && (*str)->content[idx0] != '\n') {
			(*line)[idx1++] = (*str)->content[idx0++];
		}
		if ((*str)->content[idx0++] == '\n') {
			remaining = 1;
			idx1 = 0;
			while ((*str)->content[idx0]) {
				(*str)->content[idx1++] = (*str)->content[idx0++];
			}
			(*str)->content[idx1] = 0;
			break ;
		}
		next = (*str)->next;
		free((*str)->content);
		free(*str);
		*str = next;
	}
	return (remaining);
}

/* ************************************************************************** */
// エラー処理の共通出口。内部リストとバッファを解放し、*line を NULL 化して -1 を返す。
// これにより各失敗経路を return (gnl_clear(...)) の1行で書け、後始末の取りこぼしを防ぐ
static int
	gnl_clear(t_fd** list, int fd, char** line)
{
	free_all(list, fd, NULL);
	if (line) {
		*line = NULL;
	}
	return (-1);
}

/* ************************************************************************** */
// fd(負なら全 fd)に対応するリストノードと、各ノードが抱えるバッファ(str)を解放する。前ノード
// prev を辿りながら一致ノードだけを連結から外すので、解放済みノードを再参照しない。引数 buf が
// 非NULL ならそれも解放する(呼び出し側の一時バッファ後始末を兼ねる)。常に 0 を返す
static int
	free_all(t_fd** list, int fd, char* buf)
{
	t_fd*	cur;
	t_fd*	prev;
	t_fd*	next;

	prev = NULL;
	if (list) {
		cur = *list;
		while (cur) {
			next = cur->next;
			if (fd < 0 || cur->fd == fd) {
				if (prev) {
					prev->next = next;
				} else {
					*list = next;
				}
				str_clear(&cur->str);
				free(cur);
			} else {
				prev = cur;
			}
			cur = next;
		}
	}
	if (buf) {
		free(buf);
	}
	return (0);
}
