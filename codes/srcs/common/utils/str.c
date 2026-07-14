#include "utils/utils.h"

/* ************************************************************************** */
int
	str_length(t_str* str);
t_str*
	str_add_back(t_str** str, char* content);
t_str*
	str_last(t_str* str);
int
	str_clear(t_str** list);

/* ************************************************************************** */
// 文字列リスト（単方向連結リスト）の要素数を数えて返す
int
	str_length(t_str* str)
{
	int	i;

	i = 0;
	while (str) {
		str = str->next;
		i++;
	}
	return (i);
}

/* ************************************************************************** */
// 文字列リストの末尾に content を持つ新ノードを追加し、その新ノードを返す。content が
// NULL（呼び出し側の文字列複製失敗など）や malloc 失敗時は NULL を返す。リストが空なら
// 先頭に据え、そうでなければ末尾まで辿って繋ぐ（*str は first で元の先頭へ戻す）
t_str*
	str_add_back(t_str** str, char* content)
{
	t_str*	first;
	t_str*	new;

	if (!content) {
		return (NULL);
	}
	new = (t_str*)malloc(sizeof(*new));
	if (!new) {
		return (NULL);
	}
	new->content = content;
	new->next = NULL;
	if (!*str) {
		*str = new;
	} else {
		first = *str;
		while ((*str)->next) {
			*str = (*str)->next;
		}
		(*str)->next = new;
		*str = first;
	}
	return (new);
}

/* ************************************************************************** */
// 文字列リストの最後の要素を返す（空リストなら NULL）
t_str*
	str_last(t_str* str)
{
	if (!str) {
		return (NULL);
	}
	while (str->next) {
		str = str->next;
	}
	return (str);
}

/* ************************************************************************** */
// 文字列リストの全ノードと各 content を解放し、リストを空にする。戻り値 0 は「失敗の 0」を
// 呼び出し側が return (str_clear(...)) の形でそのまま返せるようにするための慣用
int
	str_clear(t_str** list)
{
	t_str*	tmp;

	while (*list) {
		tmp = (*list)->next;
		free((*list)->content);
		free(*list);
		(*list) = tmp;
	}
	return (0);
}
