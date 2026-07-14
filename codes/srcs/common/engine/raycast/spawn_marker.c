#include "engine/raycast/raycast.h"
#include "config/config.h"     /* IS_RED_SPAWN / IS_BLUE_SPAWN / TEX_PAS_* のため */

/* ************************************************************************** */
int
	spawn_marker_slot(char c);

/* ************************************************************************** */
// スポーン文字に応じたマーカー(光るオブジェクト)のテクスチャスロットを返す。
// 赤チーム(N/W)は TEX_PAS_3(=OP3)、青チーム(S/E)は TEX_PAS_2(=OP2)。N/S/E/W のマスへ
// 自動配置するマーカーの色分けロジックをここ一箇所に集約する。想定外の文字は -1 を返し、
// 呼び出し側でマーカーを置かない（無効スロットの混入を防ぐ）
int
	spawn_marker_slot(char c)
{
	if (IS_RED_SPAWN(c)) {
		return (TEX_PAS_3);
	} else if (IS_BLUE_SPAWN(c)) {
		return (TEX_PAS_2);
	}
	return (-1);
}
