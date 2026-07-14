#include "utils/utils.h"       /* 自身のプロトタイプ宣言・ft_strlen / ft_strcmp のため */

/* ************************************************************************** */
int
	ft_endswith(const char* str, const char* end);

/* ************************************************************************** */
// str が接尾辞 end で終わるなら 1、そうでなければ 0 を返す。end が str より長ければ即 0。
// str の末尾 end_length 文字を ft_strcmp で照合する（".cub" 拡張子チェックなどに使う）
int
	ft_endswith(const char* str, const char* end)
{
	int	length;
	int	end_length;

	length = ft_strlen(str);
	end_length = ft_strlen(end);
	if (end_length > length) {
		return (0);
	}
	return (!ft_strcmp(str + length - end_length, end));
}
