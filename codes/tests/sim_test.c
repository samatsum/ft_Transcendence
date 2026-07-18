// sim 公開 API のゲームプレイ受入テスト（native ビルド。emcc 不要）。
// `make test` がリポジトリのルートから実行する前提で、マップは相対パスで読む。
// 各 Issue の受入条件を「何が保証されるか」の単位で並べる（CR021 の What）。
//
// 対象:
//   G-05  先取点の match_rules 化（可変・既定フォールバック・実際に N 点で決着）
//   G-06  FPS ゴールの 1vs1 化（先に入った戦闘員が勝者・ハザードは勝者にならない）
//   G-07  FPS 複数スポーン（別地点から同時開始・自スポーンへの復帰）
//   G-08  敵ハザード化（接触は死亡ペナルティで試合は続行する）
#include <math.h>
#include <stdio.h>
#include <stdlib.h>

#include "core/core.h"
#include "core/respawn.h"
#include "platform/sim.h"
#include "rsp/rsp_game.h"

#define RSP_MAP		"maps/rsp_map/rsp.cub"
#define FPS_MAP		"maps/fps_map/21x21_arena.cub"
#define FPS_MAP_1SPAWN	"maps/fps_map/1.cub"
#define TEST_SEED	4242u
#define MAX_TICKS	200000
#define TICK_DT		(1.0 / 30.0)
#define SNAP_CAP	512

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

// 指定した文字のセル中心を1つ返す
static int
	find_char_cell(t_game* game, char want, t_pos* out)
{
	int	x;
	int	y;

	y = 0;
	while (y < game->config.map.rows) {
		x = 0;
		while (x < game->config.map.columns) {
			if ((char)MAP_XY(x, y, game->config) == want) {
				set_pos(out, x + 0.5, y + 0.5);
				return (1);
			}
			x++;
		}
		y++;
	}
	return (0);
}

// 収集アイテムのセル中心を1つ返す
static int
	find_collectible_cell(t_game* game, t_pos* out)
{
	int	x;
	int	y;

	y = 0;
	while (y < game->config.map.rows) {
		x = 0;
		while (x < game->config.map.columns) {
			if (IS_COLLECTIBLE(MAP_XY(x, y, game->config))) {
				set_pos(out, x + 0.5, y + 0.5);
				return (1);
			}
			x++;
		}
		y++;
	}
	return (0);
}

// world.sprites の要素数
static int
	count_sprites(t_game* game)
{
	t_sprite*	cur;
	int			n;

	n = 0;
	cur = game->world.sprites;
	while (cur) {
		n++;
		cur = cur->next;
	}
	return (n);
}

// 指定スプライトが描画リストに繋がっているか
static int
	sprite_in_list(t_game* game, t_sprite* sprite)
{
	t_sprite*	cur;

	cur = game->world.sprites;
	while (cur) {
		if (cur == sprite) {
			return (1);
		}
		cur = cur->next;
	}
	return (0);
}

// 全戦闘員の身体スプライトが描画リストに残っているか。サーバ実行では席の
// sprite も world.sprites に繋がるので、誤削除はここで検出できる
static int
	combatant_sprites_intact(t_game* game)
{
	t_enemy*	cur;

	cur = game->world.enemies;
	while (cur) {
		if (!cur->is_player && !sprite_in_list(game, cur->sprite)) {
			return (0);
		}
		cur = cur->next;
	}
	return (1);
}

// マップ由来の敵ハザードを1体返す
static t_enemy*
	first_hazard(t_game* game)
{
	t_enemy*	cur;

	cur = game->world.enemies;
	while (cur) {
		if (cur->is_hazard) {
			return (cur);
		}
		cur = cur->next;
	}
	return (NULL);
}

// FPS 1vs1（席2つとも外部入力）を生成する
static t_game*
	create_fps_duel(const char* map_text)
{
	t_game*	game;

	game = sim_create(map_text, 0, 0, TEST_SEED);
	if (!game) {
		return (NULL);
	}
	if (game_add_combatant(game, 0, 0) != 0
		|| game_add_combatant(game, 1, 0) != 1) {
		game_destroy(game);
		return (NULL);
	}
	return (game);
}

// G-06: 先にゴールセルへ入った戦闘員が勝者になること。どちらの席でも同じ規則で
// 帰属し、snapshot にも combatant_id として載る（② §5-C）
static void
	test_g06_goal_winner(const char* map_text, int winner_seat)
{
	t_game*	game;
	double	snap[SNAP_CAP];
	t_pos	goal;
	char	label[64];
	int		len;

	game = create_fps_duel(map_text);
	if (!game || !find_char_cell(game, GOAL_CHAR, &goal)) {
		printf("  FAIL cannot stage FPS duel\n");
		g_failures++;
		g_checks++;
		game_destroy(game);
		return ;
	}
	copy_pos(&combatant_by_id(game, winner_seat)->sprite->pos, &goal);
	game_step(game, TICK_DT);
	snprintf(label, sizeof(label), "席%d のゴールで finished", winner_seat);
	expect_int(label, game->cleared, 1);
	snprintf(label, sizeof(label), "席%d が勝者", winner_seat);
	expect_int(label, game->fps.winner, winner_seat);
	len = game_snapshot(game, snap, SNAP_CAP);
	snprintf(label, sizeof(label), "席%d が snapshot の winner", winner_seat);
	expect_int(label, (len > 0) ? (int)snap[1] : -99, winner_seat);
	game_destroy(game);
}

// G-06: マップ由来の敵ハザードは席ではないので、ゴールに乗っても試合は終わらない
static void
	test_g06_hazard_cannot_win(const char* map_text)
{
	t_game*		game;
	t_enemy*	hazard;
	t_pos		goal;

	game = create_fps_duel(map_text);
	if (!game || !find_char_cell(game, GOAL_CHAR, &goal)) {
		printf("  FAIL cannot stage FPS duel\n");
		g_failures++;
		g_checks++;
		game_destroy(game);
		return ;
	}
	hazard = first_hazard(game);
	expect_int("マップに敵ハザードが居る", hazard != NULL, 1);
	if (hazard) {
		copy_pos(&hazard->sprite->pos, &goal);
		game_step(game, TICK_DT);
		expect_int("ハザードのゴールでは決着しない", game->cleared, 0);
		expect_int("勝者は未確定のまま", game->fps.winner, -1);
	}
	game_destroy(game);
}

// G-06: 収集は席なら誰でも共有カウンタへ加算され、同じマスに立つ戦闘員の身体を
// 巻き添えにしない。サーバ実行はマップテクスチャを読まないためアイテムの
// スプライト自体が存在せず（描画データはクライアントの持ち物）、削除は no-op に
// なる。マス一致で先頭を消す旧実装だと、ここで席の身体が解放されていた
static void
	test_g06_collect_keeps_combatant_sprite(const char* map_text)
{
	t_game*		game;
	t_enemy*	seat;
	t_pos		item;
	int			before;

	game = create_fps_duel(map_text);
	if (!game || !find_collectible_cell(game, &item)) {
		printf("  FAIL cannot stage collectible\n");
		g_failures++;
		g_checks++;
		game_destroy(game);
		return ;
	}
	seat = combatant_by_id(game, 1);
	copy_pos(&seat->sprite->pos, &item);
	before = count_sprites(game);
	game_step(game, TICK_DT);
	expect_int("収集数が1増える", game->world.collected, 1);
	expect_int("収集セルが 'A' になる", MAP(item, game->config), 'A');
	expect_int("収集した席の身体が残る", sprite_in_list(game, seat->sprite), 1);
	expect_int("戦闘員の身体を巻き添えにしない", combatant_sprites_intact(game), 1);
	expect_int("消えたスプライトは最大1つ", before - count_sprites(game) <= 1, 1);
	game_destroy(game);
}

// 2点が同じマスかどうか
static int
	same_cell(t_pos* a, t_pos* b)
{
	return ((int)a->x == (int)b->x && (int)a->y == (int)b->y);
}

// G-07: FPS 1vs1 の2席が別々の地点から同時に開始し、各席が自分の開始地点を
// 安定したアンカー（spawn）として持つこと
static void
	test_g07_distinct_spawns(const char* map_text)
{
	t_game*		game;
	t_enemy*	a;
	t_enemy*	b;

	game = create_fps_duel(map_text);
	if (!game) {
		printf("  FAIL cannot stage FPS duel\n");
		g_failures++;
		g_checks++;
		return ;
	}
	a = combatant_by_id(game, 0);
	b = combatant_by_id(game, 1);
	expect_int("2席とも生成される", a != NULL && b != NULL, 1);
	if (a && b) {
		expect_int("2席が別のマスから開始する", same_cell(&a->sprite->pos, &b->sprite->pos), 0);
		expect_int("席0 のアンカーが開始位置と一致", same_cell(&a->spawn.pos, &a->sprite->pos), 1);
		expect_int("席1 のアンカーが開始位置と一致", same_cell(&b->spawn.pos, &b->sprite->pos), 1);
		expect_int("席0 がスポーンの向きを向く",
			fabs(a->dir_angle - atan2(a->spawn.dir.y, a->spawn.dir.x)) < 1e-9, 1);
	}
	game_destroy(game);
}

// G-07: 死亡復帰は自分の開始地点へ戻る。相手の地点や再抽選された別地点へ
// 湧かないこと（① §4-C の「自スポーンへリスポーン」）
static void
	test_g07_respawn_to_own_spawn(const char* map_text)
{
	t_game*		game;
	t_enemy*	a;
	t_enemy*	b;
	t_pos		anchor_a;
	t_pos		away;

	game = create_fps_duel(map_text);
	if (!game) {
		printf("  FAIL cannot stage FPS duel\n");
		g_failures++;
		g_checks++;
		return ;
	}
	a = combatant_by_id(game, 0);
	b = combatant_by_id(game, 1);
	copy_pos(&anchor_a, &a->spawn.pos);
	set_pos(&away, anchor_a.x, anchor_a.y);
	if (find_char_cell(game, GOAL_CHAR, &away)) {
		copy_pos(&a->sprite->pos, &away);
	}
	respawn_combatant(game, a);
	expect_int("自分の開始地点へ戻る", same_cell(&a->sprite->pos, &anchor_a), 1);
	expect_int("相手の地点へは湧かない", same_cell(&a->sprite->pos, &b->spawn.pos), 0);
	expect_int("復帰してもアンカーは変わらない", same_cell(&a->spawn.pos, &anchor_a), 1);
	game_destroy(game);
}

// G-07: スポーンが1つしかないマップでは FPS の 1vs1 を成立させない
// （席の重複配置を黙って許すより、ルーム生成を失敗させる方が安全）
static void
	test_g07_single_spawn_map_rejected(const char* map_text)
{
	t_game*	game;

	game = sim_create(map_text, 0, 0, TEST_SEED);
	expect_int("スポーン1つの FPS マップは生成失敗", game == NULL, 1);
	game_destroy(game);
}

// G-08: ハザードに触れた席は死亡ペナルティを受けるが、試合は終わらない。
// 復帰は自スポーンで、相方の席は巻き添えにならず動き続ける
static void
	test_g08_hazard_contact_is_penalty(const char* map_text)
{
	t_game*		game;
	t_enemy*	victim;
	t_enemy*	other;
	t_enemy*	hazard;
	t_pos		anchor;
	int			guard;

	game = create_fps_duel(map_text);
	if (!game) {
		printf("  FAIL cannot stage FPS duel\n");
		g_failures++;
		g_checks++;
		return ;
	}
	victim = combatant_by_id(game, 0);
	other = combatant_by_id(game, 1);
	hazard = first_hazard(game);
	copy_pos(&anchor, &victim->spawn.pos);
	copy_pos(&victim->sprite->pos, &hazard->sprite->pos);
	game_step(game, TICK_DT);
	expect_int("ハザード接触で死亡する", victim->death_timer > 0.0, 1);
	expect_int("接触では試合が終わらない", game->cleared, 0);
	expect_int("勝者は確定しない", game->fps.winner, -1);
	expect_int("相方は死なない", other->death_timer <= 0.0, 1);
	guard = 0;
	while (victim->death_timer > 0.0 && guard < MAX_TICKS) {
		game_step(game, TICK_DT);
		guard++;
	}
	expect_int("死亡演出は有限時間で終わる", guard < MAX_TICKS, 1);
	expect_int("復帰しても試合は続いている", game->cleared, 0);
	expect_int("自スポーンへ復帰する", same_cell(&victim->sprite->pos, &anchor), 1);
	game_destroy(game);
}

// G-08: ハザード同士は接触しても死なない（席だけがペナルティ対象）
static void
	test_g08_hazards_do_not_kill_each_other(const char* map_text)
{
	t_game*		game;
	t_enemy*	hazard;
	t_enemy*	cur;
	int			dead_hazards;

	game = create_fps_duel(map_text);
	if (!game) {
		printf("  FAIL cannot stage FPS duel\n");
		g_failures++;
		g_checks++;
		return ;
	}
	hazard = first_hazard(game);
	cur = game->world.enemies;
	while (cur) {
		if (cur->is_hazard && cur != hazard) {
			copy_pos(&cur->sprite->pos, &hazard->sprite->pos);
		}
		cur = cur->next;
	}
	game_step(game, TICK_DT);
	dead_hazards = 0;
	cur = game->world.enemies;
	while (cur) {
		if (cur->is_hazard && cur->death_timer > 0.0) {
			dead_hazards++;
		}
		cur = cur->next;
	}
	expect_int("ハザード同士は死なない", dead_hazards, 0);
	game_destroy(game);
}

// G-08: 死亡中の席は動かないが、世界（相方・ハザード）は止まらない
static void
	test_g08_world_keeps_running_while_dead(const char* map_text)
{
	t_game*		game;
	t_enemy*	victim;
	t_enemy*	other;
	t_pos		frozen;
	t_pos		moved;
	int			i;

	game = create_fps_duel(map_text);
	if (!game) {
		printf("  FAIL cannot stage FPS duel\n");
		g_failures++;
		g_checks++;
		return ;
	}
	victim = combatant_by_id(game, 0);
	other = combatant_by_id(game, 1);
	copy_pos(&victim->sprite->pos, &first_hazard(game)->sprite->pos);
	game_step(game, TICK_DT);
	copy_pos(&frozen, &victim->sprite->pos);
	copy_pos(&moved, &other->sprite->pos);
	i = 0;
	while (i < 30) {
		sim_set_input(game, 0, 1, 0, 0, 0, 0.0);
		sim_set_input(game, 1, 1, 0, 0, 0, 0.0);
		game_step(game, TICK_DT);
		i++;
	}
	expect_int("死亡中の席は入力で動かない",
		same_cell(&victim->sprite->pos, &frozen), 1);
	expect_int("生存中の相方は動ける",
		other->sprite->pos.x != moved.x || other->sprite->pos.y != moved.y, 1);
	game_destroy(game);
}

// G-08: ハザードが席を狙う FPS 1vs1 を連続実行しても破綻しないこと。ハザードの
// 追跡は経路探索を伴い、以前はカメラ（サーバ実行では原点）を狙っていたので、
// 席を狙う経路が長時間まわることをここで担保する
static void
	test_g08_headless_soak(const char* map_text)
{
	t_game*	game;
	int		tick;
	int		deaths;

	game = create_fps_duel(map_text);
	if (!game) {
		printf("  FAIL cannot stage FPS duel\n");
		g_failures++;
		g_checks++;
		return ;
	}
	deaths = 0;
	tick = 0;
	while (tick < 3000 && !game->cleared) {
		sim_set_input(game, 0, 1, 0, 0, 0, (double)tick / 53.0);
		sim_set_input(game, 1, 1, 0, 0, 0, -(double)tick / 71.0);
		game_step(game, TICK_DT);
		if (combatant_by_id(game, 0)->death_timer > 0.0
			|| combatant_by_id(game, 1)->death_timer > 0.0) {
			deaths++;
		}
		tick++;
	}
	expect_int("3000 ティック連続実行できる", tick, 3000);
	expect_int("接触だけでは試合が終わらない", game->cleared, 0);
	printf("  info: 死亡中だったティック数 %d/3000\n", deaths);
	game_destroy(game);
}

int
	main(void)
{
	char*	rsp_map;
	char*	fps_map;
	char*	fps_map_1spawn;

	rsp_map = read_map(RSP_MAP);
	fps_map = read_map(FPS_MAP);
	fps_map_1spawn = read_map(FPS_MAP_1SPAWN);
	if (!rsp_map || !fps_map || !fps_map_1spawn) {
		printf("FAILED: マップが読めない（リポジトリのルートから実行すること）\n");
		return (1);
	}
	test_g05_target_score(rsp_map);
	test_g05_decides_at_target(rsp_map, 2);
	test_g05_decides_at_target(rsp_map, 3);
	test_g05_decides_at_target(rsp_map, RSP_SCORE_LIMIT);
	printf("G-06 FPS ゴールの 1vs1 化\n");
	test_g06_goal_winner(fps_map, 0);
	test_g06_goal_winner(fps_map, 1);
	test_g06_hazard_cannot_win(fps_map);
	test_g06_collect_keeps_combatant_sprite(fps_map);
	printf("G-07 FPS 複数スポーン（1vs1 同時開始）\n");
	test_g07_distinct_spawns(fps_map);
	test_g07_respawn_to_own_spawn(fps_map);
	test_g07_single_spawn_map_rejected(fps_map_1spawn);
	printf("G-08 敵ハザード化（接触＝ペナルティ）\n");
	test_g08_hazard_contact_is_penalty(fps_map);
	test_g08_hazards_do_not_kill_each_other(fps_map);
	test_g08_world_keeps_running_while_dead(fps_map);
	test_g08_headless_soak(fps_map);
	free(rsp_map);
	free(fps_map);
	free(fps_map_1spawn);
	printf("\n%d checks, %d failure(s)\n", g_checks, g_failures);
	if (g_failures) {
		printf("FAILED\n");
		return (1);
	}
	printf("OK\n");
	return (0);
}
