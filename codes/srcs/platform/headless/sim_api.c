#include <math.h>
#include <stdlib.h>

#include "core/core.h"
#include "core/mode_ops.h"
#include "enemy/enemy.h"
#include "engine/raycast/raycast.h"
#include "engine/render/light.h"
#include "engine/render/render.h"
#include "engine/texture/texture.h"
#include "platform/platform.h"
#include "platform/sim.h"
#include "rsp/rsp_game.h"
#include "tuning.h"

/* ************************************************************************** */
// 先取点の下限。エンジンは機構として 1 点以上を受理し、② §4-B の製品仕様
// レンジ（3–21）は WS 層のスキーマ検証（W-11 №6）で弾く。エンジン側へ
// 製品ポリシーを二重化すると ① §6 G-05 の受入条件「テスト用に N=2 でも
// 動く」を満たせなくなるため、範囲の責務はサーバ層に一本化する
#define SIM_TARGET_SCORE_MIN	1
// FPS の席数（1vs1。② §6-B の「RSP=4席 / FPS=2席」）
#define SIM_FPS_SEATS			2

/* ************************************************************************** */
// game_create が返す t_game の実体。席→スポーン地点の対応（RSP は生成時に
// チーム別へ2+2を先取りして席番号で固定する）と使用済み席を game に添えて持つ。
// t_game が先頭メンバなので公開 API は t_game* をそのまま handle にできる
typedef struct s_sim_game
{
	t_game	game;
	int		seat_spawn[RSP_COMBATANTS];
	int		seat_used[RSP_COMBATANTS];
	int		seat_count;
}	t_sim_game;

/* ************************************************************************** */
t_game*
	game_create(const char* cub_text, int mode, const t_match_rules* rules);
int
	game_add_combatant(t_game* game, int slot, int is_ai);
int
	game_set_input(t_game* game, int combatant_id, const t_input* input);
int
	game_set_input_source(t_game* game, int combatant_id, int source);
int
	game_snapshot(t_game* game, double* buf, int max_doubles);
void
	game_destroy(t_game* game);
t_game*
	sim_create(const char* cub_text, int is_rsp, int target_score,
		unsigned int seed);
int
	sim_set_input(t_game* game, int combatant_id, int forward, int backward,
		int strafe_left, int strafe_right, double yaw);
static int
	sim_prepare_world(t_sim_game* sim);
static int
	sim_reserve_seats(t_sim_game* sim);
static t_enemy*
	find_combatant(t_game* game, int combatant_id);
static void
	set_seat_source(t_enemy* seat, int source);
static int
	snapshot_combatant(t_game* game, t_enemy* cur, double* buf);

/* ************************************************************************** */
// sim 公開 API の入口。メモリ上の .cub テキストから、描画・ウィンドウ・ファイル
// I/O なしで試合状態を組み立てる。席（戦闘員）は含まれず、game_add_combatant で
// 追加する（② §6-B の「席の確定」）。失敗時は NULL を返しプロセスを終了しない
t_game*
	game_create(const char* cub_text, int mode, const t_match_rules* rules)
{
	t_sim_game*	sim;
	t_game*		game;

	if (!cub_text || (mode != MODE_FPS && mode != MODE_RSP)) {
		return (NULL);
	}
	sim = (t_sim_game*)calloc(1, sizeof(*sim));
	if (!sim) {
		return (NULL);
	}
	game = &sim->game;
	game->mode = mode;
	game->mode_ops = fps_mode_ops();
	if (mode == MODE_RSP) {
		game->mode_ops = rsp_mode_ops();
	}
	init_config(&game->config);
	if (!parse_config_text(&game->config, cub_text)) {
		game_destroy(game);
		return (NULL);
	}
	init_game(game);
	if (rules && rules->seed != 0) {
		// 乱数系列の固定（再現テスト・デモ記録用）。スポーン抽選より前に
		// 上書きしないと席の配置が時刻由来のままになるため、この位置で行う
		game->rsp.seed = rules->seed;
	}
	if (rules && rules->target_score >= SIM_TARGET_SCORE_MIN) {
		game->rsp.target_score = rules->target_score;
	}
	if (!sim_prepare_world(sim)) {
		game_destroy(game);
		return (NULL);
	}
	return (game);
}

/* ************************************************************************** */
// パース済み・init_game 済みの状態から席以外の世界（マップ由来スプライト・
// 敵ハザード・収集物）を組み立てる。テクスチャ読込は headless の
// pf_load_texture が 1x1 ダミーで成功させるため、native と同じ資産初期化
// 経路を分岐なしで通せる
static int
	sim_prepare_world(t_sim_game* sim)
{
	t_game*		game;
	t_enemy*	cur;
	int			hazard_id;

	game = &sim->game;
	game->input.current_weapon = WEP_PISTOL;
	game->input.is_shooting = 0;
	load_player_assets(game);
	if (!init_enemy_textures(game) || !game->mode_ops.init_assets(game)) {
		return (0);
	}
	collect_spawns(&game->config);
	if (!scan_world_sprites(game) || !sim_reserve_seats(sim)) {
		return (0);
	}
	count_items(game);
	hazard_id = SIM_HAZARD_ID_BASE;
	cur = game->world.enemies;
	while (cur) {
		cur->combatant_id = hazard_id++;
		cur = cur->next;
	}
	game->start_time_ms = get_current_time_ms();
	return (1);
}

/* ************************************************************************** */
// 席番号→スポーン地点の対応を先に確定する。RSP は赤(N/W)2 + 青(S/E)2 を
// native の setup_rsp_combatants と同じ抽選で選び、席 0..1=赤 / 2..3=青 に
// 固定する。FPS は全方向スポーンから席数ぶんを重複なしで選ぶ
static int
	sim_reserve_seats(t_sim_game* sim)
{
	t_game*	game;
	int		n;

	game = &sim->game;
	if (game->mode == MODE_RSP) {
		sim->seat_count = RSP_COMBATANTS;
		n = pick_spawn_indices(&game->config, RSP_RED_DIRS, &game->rsp.seed,
				sim->seat_spawn, RSP_TEAM_SPAWNS);
		n += pick_spawn_indices(&game->config, RSP_BLUE_DIRS, &game->rsp.seed,
				sim->seat_spawn + n, RSP_TEAM_SPAWNS);
	} else {
		sim->seat_count = SIM_FPS_SEATS;
		n = pick_spawn_indices(&game->config, DIRECTIONS, &game->rsp.seed,
				sim->seat_spawn, SIM_FPS_SEATS);
	}
	return (n >= sim->seat_count);
}

/* ************************************************************************** */
// 席 slot に戦闘員を1体生成し、combatant_id（=slot）を返す。RSP のチームは
// 席番号で決まり（0..1=赤 / 2..3=青）、初期の手は乱数。人間未接続席も先に
// AI で生成し、join 時に game_set_input_source で EXTERNAL へ切り替える運用
// （② §6-B 追補）を想定する。失敗・重複・範囲外は -1
int
	game_add_combatant(t_game* game, int slot, int is_ai)
{
	t_sim_game*		sim;
	t_spawn_point*	sp;
	t_sprite*		sprite;
	t_enemy*		node;
	t_camera		cam;

	if (!game) {
		return (-1);
	}
	sim = (t_sim_game*)game;
	if (slot < 0 || slot >= sim->seat_count || sim->seat_used[slot]) {
		return (-1);
	}
	sp = &game->config.spawns[sim->seat_spawn[slot]];
	sprite = add_front_sprite(&game->world.sprites, 0., &sp->pos,
			&game->assets.enemy_tex[0]);
	if (!sprite) {
		return (-1);
	}
	node = add_enemy(&game->world.enemies, sprite, (int)game->config.enemy_hp);
	if (!node) {
		delete_sprite_node(&game->world.sprites, sprite);
		return (-1);
	}
	node->combatant_id = slot;
	node->rsp.team = (t_team)(slot / RSP_TEAM_SPAWNS);
	node->rsp.hand = (t_hand)((unsigned int)ft_rand(&game->rsp.seed) % HAND_COUNT);
	copy_pos(&node->rsp.spawn, &sp->pos);
	node->rsp.alive = 1;
	if (game->mode == MODE_RSP) {
		sprite->tex = &game->assets.hand_tex[HAND_SLOT(node->rsp.team, node->rsp.hand)];
	}
	apply_spawn(&game->config, &cam, sp);
	node->spawn = cam;
	node->dir_angle = atan2(cam.dir.y, cam.dir.x);
	set_seat_source(node, (is_ai) ? INPUT_SRC_AI : INPUT_SRC_EXTERNAL);
	sim->seat_used[slot] = 1;
	return (slot);
}

/* ************************************************************************** */
// 席の保持入力を差し替える（毎 tick、サーバが受信済み入力を書き込む用）。
// 対象席が無い・AI 席への書き込みは 0 を返して無視する
int
	game_set_input(t_game* game, int combatant_id, const t_input* input)
{
	t_enemy*	seat;

	if (!game || !input) {
		return (0);
	}
	seat = find_combatant(game, combatant_id);
	if (!seat || seat->input_source != INPUT_SRC_EXTERNAL) {
		return (0);
	}
	seat->input = *input;
	return (1);
}

/* ************************************************************************** */
// 席の入力源を AI / EXTERNAL へ切り替える（切断時 AI 代替⇔復帰。② §6-B 追補）。
// 切替時は AI の追跡経路と保持入力を捨て、当たり半径も入力源に合わせる
int
	game_set_input_source(t_game* game, int combatant_id, int source)
{
	t_enemy*	seat;

	if (!game || (source != INPUT_SRC_AI && source != INPUT_SRC_EXTERNAL)) {
		return (0);
	}
	seat = find_combatant(game, combatant_id);
	if (!seat) {
		return (0);
	}
	set_seat_source(seat, source);
	return (1);
}

/* ************************************************************************** */
// 現在状態をフラット f64 配列へ書き出す（レイアウトは platform/sim.h 参照）。
// JSON 化と tick 付与は Node 側の責務（② §6-B）。書いた要素数を返し、
// バッファ不足は 0
int
	game_snapshot(t_game* game, double* buf, int max_doubles)
{
	t_enemy*	cur;
	int			count;
	int			used;

	if (!game || !buf) {
		return (0);
	}
	count = 0;
	cur = game->world.enemies;
	while (cur) {
		count++;
		cur = cur->next;
	}
	if (max_doubles < SIM_SNAP_HEADER_DOUBLES + count * SIM_SNAP_COMBATANT_DOUBLES) {
		return (0);
	}
	buf[0] = (game->cleared) ? SIM_STATE_FINISHED : SIM_STATE_PLAYING;
	buf[1] = (game->mode == MODE_RSP) ? game->rsp.winner : game->fps.winner;
	buf[2] = game->rsp.score[TEAM_RED];
	buf[3] = game->rsp.score[TEAM_BLUE];
	buf[4] = count;
	used = SIM_SNAP_HEADER_DOUBLES;
	cur = game->world.enemies;
	while (cur) {
		used += snapshot_combatant(game, cur, buf + used);
		cur = cur->next;
	}
	return (used);
}

/* ************************************************************************** */
// 戦闘員1体ぶんのスナップショット要素を書き込み、書いた要素数を返す。
// FPS の alive は死亡ペナルティ（death_timer）も反映する: G-08 で「死亡中＝
// 操作不能・世界へ干渉しない」が席の状態になったため、alive=true のまま
// respawn_s>0 という矛盾した組をクライアント（W-11 の HUD・操作可否判断）へ
// 出さない
static int
	snapshot_combatant(t_game* game, t_enemy* cur, double* buf)
{
	buf[0] = cur->combatant_id;
	buf[1] = cur->rsp.team;
	buf[2] = cur->rsp.hand;
	buf[3] = cur->sprite->pos.x;
	buf[4] = cur->sprite->pos.y;
	buf[5] = cur->dir_angle;
	buf[6] = (game->mode == MODE_RSP)
		? cur->rsp.alive
		: (cur->state != ENEMY_STATE_DEAD && cur->death_timer <= 0.0);
	buf[7] = (cur->input_source == INPUT_SRC_AI);
	buf[8] = cur->death_timer;
	return (SIM_SNAP_COMBATANT_DOUBLES);
}

/* ************************************************************************** */
// exit_game と同じ解放系から MLX/exit() を除いたもの（① §3-B）。部分的に
// 初期化が失敗した状態でも安全に呼べる（各 clear_* は NULL 耐性を持つ）
void
	game_destroy(t_game* game)
{
	if (!game) {
		return ;
	}
	clear_config(&game->config);
	clear_textures(&game->window, game->assets.tex);
	clear_sprites(&game->world.sprites);
	clear_enemies(&game->world.enemies);
	clear_lights(&game->world);
	clear_assets(game);
	pf_shutdown(&game->window);
	free((t_sim_game*)game);
}

/* ************************************************************************** */
// JS（Node）向けの生成ラッパ。モードはマップ配置ディレクトリ由来の is_rsp で
// 受け、match_rules は target_score と seed をスカラで受ける（seed=0 で
// 時刻由来、非 0 で試合全体が決定的に再現される）
t_game*
	sim_create(const char* cub_text, int is_rsp, int target_score,
		unsigned int seed)
{
	t_match_rules	rules;

	rules.target_score = target_score;
	rules.seed = seed;
	return (game_create(cub_text, (is_rsp) ? MODE_RSP : MODE_FPS, &rules));
}

/* ************************************************************************** */
// JS（Node）向けの入力ラッパ。② §5-A の {mv, yaw} を t_input へ写像する。
// yaw は絶対角（クライアント権威の視点回転。② §5-C）として席へ直接反映し、
// 回転キーは使わない
int
	sim_set_input(t_game* game, int combatant_id, int forward, int backward,
		int strafe_left, int strafe_right, double yaw)
{
	t_enemy*	seat;
	t_input		input;

	if (!game) {
		return (0);
	}
	seat = find_combatant(game, combatant_id);
	if (!seat || seat->input_source != INPUT_SRC_EXTERNAL) {
		return (0);
	}
	input = (t_input){0};
	input.current_weapon = WEP_PISTOL;
	set_pos(&input.move, (forward != 0), (backward != 0));
	set_pos(&input.x_move, (strafe_left != 0), (strafe_right != 0));
	seat->input = input;
	seat->dir_angle = yaw;
	return (1);
}

/* ************************************************************************** */
// combatant_id から戦闘員ノードを引く（席・敵ハザード共通）
static t_enemy*
	find_combatant(t_game* game, int combatant_id)
{
	t_enemy*	cur;

	cur = game->world.enemies;
	while (cur) {
		if (cur->combatant_id == combatant_id) {
			return (cur);
		}
		cur = cur->next;
	}
	return (NULL);
}

/* ************************************************************************** */
// 入力源と付随状態（当たり半径・AI 経路・保持入力）をまとめて切り替える。
// 半径は native の対応（プレイヤー=PLAYER_RADIUS / NPC=ENEMY_RADIUS）に合わせ、
// AI 代替中の席は native の NPC と同じ移動判定になる
static void
	set_seat_source(t_enemy* seat, int source)
{
	seat->input_source = source;
	seat->radius = (source == INPUT_SRC_EXTERNAL) ? PLAYER_RADIUS : ENEMY_RADIUS;
	seat->input = (t_input){0};
	seat->input.current_weapon = WEP_PISTOL;
	seat->path_valid = 0;
	seat->state = ENEMY_STATE_IDLE;
}
