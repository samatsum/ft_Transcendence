#include "utils/utils.h"       /* 自身のプロトタイプ宣言・ft_substr / str_* / PTR_CAST のため */

/* ************************************************************************** */
t_str*
	ft_split(const char* org, char sep);

/* ************************************************************************** */
// 文字列 org を区切り文字 sep で分割し、各トークンを t_str 連結リストにして返す。区切りの
// たびに [start, i) を ft_substr で切り出して末尾へ追加し、連続する sep は空トークンを生まない
// よう i-start>0 のときだけ足す。途中で確保に失敗したら、それまでのリストを str_clear で
// 解放して NULL を返す（PTR_CAST は str_clear の戻り値 0 を void*=NULL へ整形する）
t_str*
	ft_split(const char* org, char sep)
{
	t_str*	str;
	int		i;
	int		start;

	start = 0;
	i = 0;
	str = NULL;
	while (org[i]) {
		if (org[i] == sep) {
			if (i - start > 0 && !str_add_back(&str, ft_substr(org, start, i - start))) {
				return (PTR_CAST(str_clear(&str)));
			}
			start = ++i;
		} else {
			i++;
		}
	}
	if (i - start > 0 && !str_add_back(&str, ft_substr(org, start, i - start))) {
		return (PTR_CAST(str_clear(&str)));
	}
	return (str);
}
