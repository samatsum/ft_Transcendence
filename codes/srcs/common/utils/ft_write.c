#include "utils/utils.h"       /* 自身のプロトタイプ宣言のため */

/* ************************************************************************** */
int
	ft_write_int(char* buf, int val, int start);
int
	ft_write_str(char* buf, char* str, int start);
int
	ft_write_int_n(char* buf, int size, int val, int start);
int
	ft_write_str_n(char* buf, int size, char* str, int start);

/* ************************************************************************** */
// バッファ buf の start 位置から整数 val を10進文字列として書き込み、書き込み後の終端位置を返す。
// まず桁数 length を数え、各桁を下位から所定の位置へ置く。val==0 は '0' 1文字。負数は想定しない
// （UI の数値表示など非負前提）。末尾に '\0' を付ける。境界チェックはしないので buf は十分な容量を要する
int
	ft_write_int(char* buf, int val, int start)
{
	int	length;
	int	tmp;

	length = 1;
	tmp = val;
	while (tmp > 9) {
		length++;
		tmp /= 10;
	}
	if (val == 0) {
		buf[start++] = '0';
	} else {
		tmp = length;
		while (val > 0) {
			buf[start + --tmp] = "0123456789"[val % 10];
			val /= 10;
		}
		start += length;
	}
	buf[start] = 0;
	return (start);
}

/* ************************************************************************** */
// バッファ buf の start 位置から文字列 str をそのまま書き込み、書き込み後の終端位置を返す。
// 末尾に '\0' を付ける。境界チェックはしないので、buf 側で十分な容量を確保しておくこと
int
	ft_write_str(char* buf, char* str, int start)
{
	int	i;

	i = 0;
	while (str[i]) {
		buf[start++] = str[i++];
	}
	buf[start] = 0;
	return (start);
}

/* ************************************************************************** */
// バッファサイズ size を超えないように文字列 str を追記し、論理上の終端位置を返す
int
	ft_write_str_n(char* buf, int size, char* str, int start)
{
	int	i;

	i = 0;
	if (size <= 0) {
		return (start);
	}
	while (str[i]) {
		if (start < size - 1) {
			buf[start] = str[i];
		}
		start++;
		i++;
	}
	if (start < size) {
		buf[start] = 0;
	} else {
		buf[size - 1] = 0;
	}
	return (start);
}

/* ************************************************************************** */
// バッファサイズ size を超えないように非負整数 val を追記し、論理上の終端位置を返す
int
	ft_write_int_n(char* buf, int size, int val, int start)
{
	char	digits[11];
	int		len;
	int		i;

	len = 0;
	if (val == 0) {
		digits[len++] = '0';
	}
	while (val > 0) {
		digits[len++] = "0123456789"[val % 10];
		val /= 10;
	}
	i = len - 1;
	while (i >= 0) {
		if (size > 0 && start < size - 1) {
			buf[start] = digits[i];
		}
		start++;
		i--;
	}
	if (size > 0 && start < size) {
		buf[start] = 0;
	} else if (size > 0) {
		buf[size - 1] = 0;
	}
	return (start);
}
