#include "utils/utils.h"       /* 自身のプロトタイプ宣言と malloc のため */

/* ************************************************************************** */
char*
	ft_strdup(const char* s1);

/* ************************************************************************** */
// 文字列 s1 を新しく確保したメモリへ複製して返す。s1 が NULL、または malloc 失敗時は NULL。
// 終端 '\0' を含めて (長さ+1) バイト確保してコピーする。確保した領域の解放は呼び出し側の責任
char*
	ft_strdup(const char* s1)
{
	char*	str;
	size_t	i;

	if (!s1) {
		return (NULL);
	}
	i = 0;
	while (s1[i]) {
		i++;
	}
	str = (char*)malloc(sizeof(*str) * (i + 1));
	if (!str) {
		return (NULL);
	}
	i = 0;
	while (s1[i]) {
		str[i] = s1[i];
		i++;
	}
	str[i] = 0;
	return (str);
}
