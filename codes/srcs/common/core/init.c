#include "engine/raycast/raycast.h"
#include "core/core.h"
#include "enemy/enemy.h"
#include "platform/platform.h"
#include "tuning.h"
#include "engine/render/light.h"
#include "core/respawn.h"

/* ************************************************************************** */
int
	finish_init(t_game* game);
void
	init_game(t_game* game);
static int
	init_window(t_window* window, t_config* config);
static int
	find_sprites(t_game* game);
static int
	scan_map_sprites(t_game* game);
static int
	add_map_sprite(t_game* game, t_pos* pos, char c);
static int
	add_object_sprite(t_game* game, t_pos* pos, char c);
static int
	add_enemy_sprite(t_game* game, t_pos* pos);
static int
	add_goal_sprite(t_game* game, t_pos* pos);
static int
	add_spawn_marker_sprite(t_game* game, t_pos* pos, char c);

/* ************************************************************************** */
// ゲームの初期化処理を完了させ、必要なリソースを準備する
int
	finish_init(t_game* game)
{
	if (!init_window(&game->window, &game->config)) {
		return (exit_error(game, "Error:\nmlx failed to create window or image.\n"));
	}
	game->input.current_weapon = WEP_PISTOL;
	game->input.is_shooting = 0;
	load_player_assets(game);
	if (!init_enemy_textures(game)) {
		return (exit_error(game, "Error:\nfailed to load enemy textures. check textures/enemy/Enemy_*.xpm.\n"));
	}
	if (!game->mode_ops.init_assets(game)) {
		if (game->mode == MODE_RSP) {
			return (exit_error(game, "Error:\nfailed to load RSP hand textures. check textures/hand/.\n"));
		}
		return (exit_error(game, "Error:\nfailed to load mode assets.\n"));
	}
	collect_spawns(&game->config);
	save_spawn(game);
	if (!load_textures(&game->window, game->assets.tex, &game->config)) {
		return (exit_error(game, "Error:\nfailed to load map texture(s). check the texture path printed above.\n"));
	}
	if (!find_sprites(game)) {
		if (game->mode == MODE_RSP) {
			return (exit_error(game, "Error:\nfailed to create RSP combatants. need 2 red spawns (N/W) and 2 blue spawns (S/E).\n"));
		}
		return (exit_error(game, "Error:\nfailed to create sprites. check object/enemy placement or memory.\n"));
	}
	if (!build_lights(&game->world, &game->config)) {
		return (exit_error(game, "Error:\nfailed to create lights. check light markers or memory.\n"));
	}
	count_items(game);
	make_tables(game);
	game->start_time_ms = get_current_time_ms();
	return (1);
}

/* ************************************************************************** */
// ゲームの内部状態を初期化する
void
	init_game(t_game* game)
{
	int				i;

	set_pos(&game->input.move, 0, 0);
	set_pos(&game->input.x_move, 0, 0);
	set_pos(&game->input.rotate, 0, 0);
	game->world.collected = 0;
	game->options = FLAG_UI | FLAG_SHADOWS | FLAG_CROSSHAIR;
	game->last_options = 0;
	game->world.sprites = NULL;
	game->world.enemies = NULL;
	game->world.lights = NULL;
	game->world.light_count = 0;
	game->death_timer = 0.0;
	game->rsp.score[TEAM_RED] = 0;
	game->rsp.score[TEAM_BLUE] = 0;
	game->rsp.winner = -1;
	game->start_time_ms = 0;
	game->fps.clear_time_ms = 0;
	game->cleared = 0;
	game->result_screenshot_saved = 0;
	game->assets.death_tex.tex = NULL;
	game->assets.death_tex.path = NULL;
	game->fps.goal_tex.tex = NULL;
	game->fps.goal_tex.path = NULL;
	game->rsp.seed = (unsigned int)pf_now_ms();
	i = 0;
	while (i < TEXTURES) {
		game->assets.tex[i++].tex = NULL;
	}
}

/* ************************************************************************** */
// ウィンドウを作成し、画面サイズやFOVの設定を行う
static int
	init_window(t_window* window, t_config* config)
{
	set_pos(&window->size, config->requested_width, config->requested_height);
	if (window->size.x > MAX_WIDTH) {
		window->size.x = MAX_WIDTH;
	}
	if (window->size.y > MAX_HEIGHT) {
		window->size.y = MAX_HEIGHT;
	}
	if (window->size.x < MIN_WIDTH) {
		window->size.x = MIN_WIDTH;
	}
	if (window->size.y < MIN_HEIGHT) {
		window->size.y = MIN_HEIGHT;
	}
	window->ptr = NULL;
	window->win = NULL;
	window->image = NULL;
	window->ratio = window->size.x / window->size.y;
	window->screen.pixels = NULL;
	window->screen.width = (int)window->size.x;
	window->screen.height = (int)window->size.y;
	window->screen.stride = 0;
	if (window->ratio < BEST_RATIO) {
		config->fov = config->fov / ((BEST_RATIO / config->fov) / FOV_SCALE);
	} else if (window->ratio > BEST_RATIO) {
		config->fov = config->fov * ((config->fov / BEST_RATIO) * FOV_SCALE);
	}
	if (!pf_init(window, window->size.x, window->size.y, "cub3d")) {
		return (0);
	}
	set_pos(&window->half, window->size.x / 2, window->size.y / 2);
	if (!pf_create_framebuffer(window)) {
		return (0);
	}
	return (1);
}

/* ************************************************************************** */
// マップ上のスプライトを検索し、種類ごとの登録処理へ振り分ける。
// RSPモードでは最後に setup_rsp_combatants でチーム/手とプレイヤー/NPCを確定する
static int
	find_sprites(t_game* game)
{
	game->world.sprites = NULL;
	if (!scan_map_sprites(game)) {
		return (0);
	}
	if (!game->mode_ops.init_world(game)) {
		return (0);
	}
	return (1);
}

/* ************************************************************************** */
// マップ全体を走査し、各セルの文字に応じたスプライト登録処理を呼び出す
static int
	scan_map_sprites(t_game* game)
{
	t_pos	pos;
	int		i;
	int		j;

	i = 0;
	while (i < game->config.map.rows) {
		j = 0;
		while (j < game->config.map.columns) {
			set_pos(&pos, j + .5, i + .5);
			if (!add_map_sprite(game, &pos, MAP_XY(j, i, game->config))) {
				return (0);
			}
			j++;
		}
		i++;
	}
	return (1);
}

/* ************************************************************************** */
// 1マスぶんの文字を判定し、オブジェクト・敵・ゴール・スポーン装飾へ振り分ける
static int
	add_map_sprite(t_game* game, t_pos* pos, char c)
{
	if (IS_OBJECT(c)) {
		return (add_object_sprite(game, pos, c));
	}
	if (c == 'M') {
		return (add_enemy_sprite(game, pos));
	}
	if (game->mode == MODE_FPS && IS_GOAL(c)) {
		return (add_goal_sprite(game, pos));
	}
	if (IS_SPAWN(c)) {
		return (add_spawn_marker_sprite(game, pos, c));
	}
	return (1);
}

/* ************************************************************************** */
// 通常オブジェクト用のテクスチャがあれば、描画スプライトとして登録する
static int
	add_object_sprite(t_game* game, t_pos* pos, char c)
{
	t_tex*		tex;
	t_sprite*	new_sprite;

	tex = &game->assets.tex[OBJ_SLOT(c)];
	if (!tex->tex) {
		return (1);
	}
	new_sprite = add_front_sprite(&game->world.sprites, 0., pos, tex);
	return (new_sprite != NULL);
}

/* ************************************************************************** */
// FPS用の敵マーカーをスプライト化し、敵リストにも紐づける
static int
	add_enemy_sprite(t_game* game, t_pos* pos)
{
	t_tex*		tex;
	t_sprite*	new_sprite;

	tex = &game->assets.enemy_tex[0];
	new_sprite = add_front_sprite(&game->world.sprites, 0., pos, tex);
	if (!new_sprite) {
		return (0);
	}
	if (!add_enemy(&game->world.enemies, new_sprite, (int)game->config.enemy_hp)) {
		delete_sprite_node(&game->world.sprites, new_sprite);
		return (0);
	}
	return (1);
}

/* ************************************************************************** */
// FPSゴール用のテクスチャを必須扱いでスプライト登録する
static int
	add_goal_sprite(t_game* game, t_pos* pos)
{
	t_tex*		tex;
	t_sprite*	new_sprite;

	tex = &game->fps.goal_tex;
	if (!tex->tex) {
		return (0);
	}
	new_sprite = add_front_sprite(&game->world.sprites, 0., pos, tex);
	return (new_sprite != NULL);
}

/* ************************************************************************** */
// スポーン地点の装飾テクスチャがあれば、補助スプライトとして登録する
static int
	add_spawn_marker_sprite(t_game* game, t_pos* pos, char c)
{
	t_tex*		tex;
	t_sprite*	new_sprite;
	int		slot;

	slot = spawn_marker_slot(c);
	if (slot < 0) {
		return (1);
	}
	tex = &game->assets.tex[slot];
	if (!tex->tex) {
		return (1);
	}
	new_sprite = add_front_sprite(&game->world.sprites, 0., pos, tex);
	return (new_sprite != NULL);
}
