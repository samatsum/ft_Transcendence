// sim 公開 API のゲームプレイ受入テスト（native ビルド。emcc 不要）。
// `make test` がリポジトリのルートから実行する前提で、マップは相対パスで読む。
// 各 Issue の受入条件を「何が保証されるか」の単位で並べる（CR021 の What）。
//
// 対象:
//   G-05  先取点の match_rules 化（可変・既定フォールバック・実際に N 点で決着）
#include <math.h>
#include <stdio.h>
#include <stdlib.h>

#include "core/core.h"
#include "platform/sim.h"
#include "rsp/rsp_game.h"

#define RSP_MAP		"maps/rsp_map/rsp.cub"
#define TEST_SEED	4242u
#define MAX_TICKS	200000
#define TICK_DT		(1.0 / 30.0)

static int	g_checks;
static int	g_failures;

// 期待値と実測値を突き合わせ、食い違いだけを報告する
static void
	expect_int(const char* label, int got, int want)
{
	g_checks++;
	if (got != want) {
		g_failures++;
		printf("  FAIL %s: got %d, want %d\n", label, got, want);
	}
}

// マップファイルを丸ごと読む（.cub はメモリ上テキストとして API へ渡す）
static char*
	read_map(const char* path)
{
	FILE*	fp;
	char*	buf;
	long	size;

	fp = fopen(path, "rb");
	if (!fp) {
		printf("  FAIL cannot open %s\n", path);
		g_failures++;
		return (NULL);
	}
	fseek(fp, 0, SEEK_END);
	size = ftell(fp);
	fseek(fp, 0, SEEK_SET);
	buf = (char*)malloc((size_t)size + 1);
	if (buf) {
		if (fread(buf, 1, (size_t)size, fp) != (size_t)size) {
			free(buf);
			buf = NULL;
		} else {
			buf[size] = 0;
		}
	}
	fclose(fp);
	return (buf);
}

// combatant_id から戦闘員ノードを引く
static t_enemy*
	combatant_by_id(t_game* game, int id)
{
	t_enemy*	cur;

	cur = game->world.enemies;
	while (cur) {
		if (cur->combatant_id == id) {
			return (cur);
		}
		cur = cur->next;
	}
	return (NULL);
}

// スポーンでも通路でもない素の床セル（'0'）の中心を1つ返す。手の再抽選
// （自陣踏み込み）が絡まない中立地点として、接触を仕込む場所に使う
static int
	find_open_cell(t_game* game, t_pos* out)
{
	int	x;
	int	y;

	y = 0;
	while (y < game->config.map.rows) {
		x = 0;
		while (x < game->config.map.columns) {
			if (MAP_XY(x, y, game->config) == '0') {
				set_pos(out, x + 0.5, y + 0.5);
				return (1);
			}
			x++;
		}
		y++;
	}
	return (0);
}

// 赤(席0)が青(席2)に必ず勝つ接触を中立セルへ仕込む。RSP の AI は追跡も逃走も
// 同じ速度倍率のため自然な接触は起きにくく、あいこだと何も解決しないまま膠着
// する。先取点というルールだけを検査したいので、勝敗の入力条件を直接与える
static void
	stage_red_win(t_game* game, t_pos* cell)
{
	t_enemy*	red;
	t_enemy*	blue;

	red = combatant_by_id(game, 0);
	blue = combatant_by_id(game, 2);
	if (!red || !blue) {
		return ;
	}
	copy_pos(&red->sprite->pos, cell);
	copy_pos(&blue->sprite->pos, cell);
	red->rsp.hand = HAND_ROCK;
	blue->rsp.hand = HAND_SCISSORS;
}

// 指定した先取点の RSP を赤1(外部入力) vs 青1(AI) で生成する。席を2つに絞る
// ことで、検査対象以外のペアが勝手に得点しない決定的な盤面にする
static t_game*
	create_duel(const char* map_text, int target_score)
{
	t_game*	game;

	game = sim_create(map_text, 1, target_score, TEST_SEED);
	if (!game) {
		return (NULL);
	}
	if (game_add_combatant(game, 0, 0) != 0
		|| game_add_combatant(game, 2, 1) != 2) {
		game_destroy(game);
		return (NULL);
	}
	return (game);
}

// G-05: match_rules.target_score が先取点として効くこと。エンジンは 1 以上を
// そのまま受理し（製品レンジ 3–21 の検証は ② §4-B のとおり WS 層の責務）、
// 0 以下は既定の RSP_SCORE_LIMIT に落ちる
static void
	test_g05_target_score(const char* map_text)
{
	const int	cases[][2] = {{1, 1}, {2, 2}, {3, 3}, {10, 10}, {21, 21},
		{100, 100}, {0, RSP_SCORE_LIMIT}, {-1, RSP_SCORE_LIMIT}};
	t_game*		game;
	char		label[64];
	int			i;

	printf("G-05 先取点の match_rules 化\n");
	i = 0;
	while (i < (int)(sizeof(cases) / sizeof(cases[0]))) {
		game = create_duel(map_text, cases[i][0]);
		if (!game) {
			printf("  FAIL create failed for target_score=%d\n", cases[i][0]);
			g_failures++;
			g_checks++;
			return ;
		}
		snprintf(label, sizeof(label), "target_score=%d の実効値", cases[i][0]);
		expect_int(label, rsp_target_score(game), cases[i][1]);
		game_destroy(game);
		i++;
	}
}

// G-05: 設定した先取点ちょうどで決着すること。target 未満の得点では決着せず
// （固定値 RSP_SCORE_LIMIT=10 のままなら N=2 で決着しない）、target 到達の
// 瞬間に finished と勝者が確定する
static void
	test_g05_decides_at_target(const char* map_text, int target)
{
	t_game*	game;
	t_pos	cell;
	char	label[64];
	int		point;
	int		early_finish;

	game = create_duel(map_text, target);
	if (!game || !find_open_cell(game, &cell)) {
		printf("  FAIL cannot stage duel for target=%d\n", target);
		g_failures++;
		g_checks++;
		game_destroy(game);
		return ;
	}
	early_finish = 0;
	point = 0;
	while (point < target) {
		stage_red_win(game, &cell);
		if (game_step(game, TICK_DT) && point + 1 < target) {
			early_finish = 1;
		}
		point++;
	}
	snprintf(label, sizeof(label), "N=%d: 到達前に決着しない", target);
	expect_int(label, early_finish, 0);
	snprintf(label, sizeof(label), "N=%d: 到達で finished", target);
	expect_int(label, game->cleared, 1);
	snprintf(label, sizeof(label), "N=%d: 勝者が赤", target);
	expect_int(label, game->rsp.winner, TEAM_RED);
	snprintf(label, sizeof(label), "N=%d: 勝者スコアがちょうど N", target);
	expect_int(label, game->rsp.score[TEAM_RED], target);
	game_destroy(game);
}

int
	main(void)
{
	char*	rsp_map;

	rsp_map = read_map(RSP_MAP);
	if (!rsp_map) {
		printf("FAILED: マップが読めない（リポジトリのルートから実行すること）\n");
		return (1);
	}
	test_g05_target_score(rsp_map);
	test_g05_decides_at_target(rsp_map, 2);
	test_g05_decides_at_target(rsp_map, 3);
	test_g05_decides_at_target(rsp_map, RSP_SCORE_LIMIT);
	free(rsp_map);
	printf("\n%d checks, %d failure(s)\n", g_checks, g_failures);
	if (g_failures) {
		printf("FAILED\n");
		return (1);
	}
	printf("OK\n");
	return (0);
}
