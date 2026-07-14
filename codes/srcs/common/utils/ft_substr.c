#include "utils/utils.h"       /* 自身のプロトタイプ宣言と malloc のため */

/* ************************************************************************** */
char*
	ft_substr(const char* s, int start, int len);

/* ************************************************************************** */
// 文字列 s の start 文字目から最大 len 文字を切り出した新しい文字列を返す（malloc 失敗時 NULL）。
// s を先頭から走査し、添字が [start, start+len) に入る文字だけを詰める。常に len+1 バイト確保して
// 末尾を '\0' 終端するので、start が文字列長を超える場合は空文字列になる
char*
	ft_substr(const char* s, int start, int len)
{
	char*	str;
	int		i;
	int		j;

	str = (char*)malloc(sizeof(*s) * (len + 1));
	if (!str) {
		return (NULL);
	}
	i = 0;
	j = 0;
	while (s[i]) {
		if (i >= start && j < len) {
			str[j] = s[i];
			j++;
		}
		i++;
	}
	str[j] = 0;
	return (str);
}
