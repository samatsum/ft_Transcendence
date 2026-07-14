#include "utils/utils.h"       /* 自身のプロトタイプ宣言のため */

/* ************************************************************************** */
int
	ft_strcmp(const char* s1, const char* s2);

/* ************************************************************************** */
// 2つの文字列を辞書順で比較する。最初に異なる位置の (unsigned char) 同士の差を返し、最後まで
// 一致すれば終端文字同士の差＝0 を返す。unsigned char へ変換して比較するので、0x80 以上のバイトでも
// 符号で大小が逆転しない
int
	ft_strcmp(const char* s1, const char* s2)
{
	int	i;

	i = 0;
	while (s1[i] && s2[i]) {
		if ((unsigned char)s1[i] != (unsigned char)s2[i]) {
			return ((unsigned char)s1[i] - (unsigned char)s2[i]);
		}
		i++;
	}
	return ((unsigned char)s1[i] - (unsigned char)s2[i]);
}
