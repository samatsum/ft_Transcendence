#ifndef UI_H
# define UI_H

# include "types.h"

/* ************************************************************************** */
// UI描画の基準解像度（ウィンドウ高さ）。各px値はこの高さのときの値で、
// 実際の描画では解像度に比例して拡大される
# define UI_REF_HEIGHT			480

// ミニマップ描画の基準値（px / 基準解像度時）
# define MAP_TILE_SIZE			5
# define SCALE					10

// UIテキスト欄の座標・サイズ設定（px / 基準解像度時）。
// UI_BG_SIZE は欄の右端x座標で、最長文字列が収まるよう設定する
# define UI_BG_X				2
# define UI_BG_Y				27
# define UI_BG_SIZE				470
# define UI_BUF_SIZE			100

// UIテキストの基準スケール（フォント8x8の倍率）と左内側パディング（px / 基準時）
# define UI_TEXT_SCALE			2
# define UI_TEXT_PAD			4

// UIやミニマップの各要素の色定義
# define COLOR_MINIMAP_WALL		0x000000
# define COLOR_MINIMAP_BG		0x10CC10
# define COLOR_MINIMAP_EMPTY	0xFFFFFF
# define COLOR_MINIMAP_ENEMY	0xFF0000

// リスポーン地点マスの色（RSPはチーム別＝赤チーム N/W / 青チーム S/E、
// FPSは全リスポーン地点を青で表示する）
# define COLOR_MINIMAP_SPAWN_RED	0xE02020
# define COLOR_MINIMAP_SPAWN_BLUE	0x2060E0

// RSPモードのNPCドット色（チーム別。味方＝プレイヤーと同チーム色、敵＝相手色）。
// スポーンマスより明るくして、自陣スポーンマス上でもドットが埋もれないようにする
# define COLOR_MINIMAP_NPC_RED	0xFF4D4D
# define COLOR_MINIMAP_NPC_BLUE	0x4DA6FF
# define COLOR_UI_BG			0xFFFFFF
# define COLOR_UI_TEXT			0xCCCCCC
# define COLOR_UI_FONT			0x000000

// 照準（クロスヘア）の描画設定
# define CH_OUTER				11
# define CH_LENGTH				10
# define CH_GAP					4
# define COLOR_CROSSHAIR		0xA020F0

/* ************************************************************************** */
// ミニマップ、テキスト、および照準の描画を制御する公開関数
void
	update_ui(t_render* rnd);
void
	write_ui_text(t_game* game);
void
	display_crosshair(t_window* w);

#endif
