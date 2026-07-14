#include "gnl/get_next_line.h"  /* 自身の宣言・t_fd / t_str・BUFFER_SIZE のため */

/* ************************************************************************** */
t_fd*
	find_fd(t_fd** list, int fd, int* new);
int
	find_nl(t_str* str, char* sim_str);
int
	read_file(t_str** str, char* buffer, int fd);

/* ************************************************************************** */
// fd に対応する状態ノードをリストから探して返す。無ければ新規に確保して先頭へ繋ぎ、*new に 1 を
// 立てる(呼び出し側が初回読み込みかを判断できる)。探索中は *list を一時的に進めるが、最後に必ず
// 先頭 first へ戻す。malloc 失敗時のみ NULL。各 fd ごとに読み残しバッファを独立保持するための土台
t_fd*
	find_fd(t_fd** list, int fd, int* new)
{
	t_fd*	ret;
	t_fd*	first;

	ret = NULL;
	first = *list;
	*new = 0;
	while (*list && !ret) {
		if ((*list)->fd == fd) {
			ret = *list;
		}
		*list = (*list)->next;
	}
	*list = first;
	if (!ret) {
		ret = (t_fd*)malloc(sizeof(*ret));
		if (!ret) {
			return (NULL);
		}
		ret->fd = fd;
		ret->next = *list;
		ret->str = NULL;
		*list = ret;
		*new = 1;
	}
	return (ret);
}

/* ************************************************************************** */
// 改行 '\n' が存在するかを判定する。str が NULL のときは生バッファ sim_str を、そうでなければ
// 連結リスト str の各チャンク content を順に走査する。1つでも改行を見つけたら 1、無ければ 0。
// read_file_until_nl が「もう1回読むべきか」を決めるのに使う
int
	find_nl(t_str* str, char* sim_str)
{
	int	i;

	if (!str) {
		i = 0;
		while (sim_str[i] && sim_str[i] != '\n') {
			i++;
		}
		if (sim_str[i] == '\n') {
			return (1);
		}
	} else {
		while (str) {
			i = 0;
			while (str->content[i] && str->content[i] != '\n') {
				i++;
			}
			if (str->content[i] == '\n') {
				return (1);
			}
			str = str->next;
		}
	}
	return (0);
}

/* ************************************************************************** */
// fd から BUFFER_SIZE バイトを1回読み、読めた分を strdup したチャンクをリスト str の末尾へ繋ぐ。
// 戻り値は 1(読み込み成功) / 0(EOF) / -1(read 失敗) / -2(malloc 失敗)。malloc に失敗した場合は
// 確保途中のノードも解放してから抜ける(リーク防止)。読み込んだ生バッファは NUL 終端しておく
int
	read_file(t_str** str, char* buffer, int fd)
{
	int		r;
	t_str*	new;
	t_str*	first;

	r = read(fd, buffer, BUFFER_SIZE);
	if (r > 0) {
		buffer[r] = 0;
		new = (t_str*)malloc(sizeof(*new));
		if (!new) {
			return (-2);
		}
		new->content = ft_strdup(buffer);
		if (!new->content) {
			free(new);
			return (-2);
		}
		new->next = NULL;
		if (!*str) {
			*str = new;
		} else {
			first = *str;
			while ((*str)->next) {
				(*str) = (*str)->next;
			}
			(*str)->next = new;
			*str = first;
		}
		return (1);
	}
	if (r < 0) {
		return (-1);
	}
	return (0);
}
