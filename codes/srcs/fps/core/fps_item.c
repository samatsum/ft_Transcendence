#include "core/core.h"
#include "tuning.h"

/* ************************************************************************** */
void
	check_quest(t_game* game);
void
	count_items(t_game* game);
static void
	check_combatant_quest(t_game* game, t_enemy* combatant);
static void
	reach_goal(t_game* game, t_enemy* combatant);
static void
	collect_item(t_game* game, t_pos* pos);
static void
	delete_item_sprite(t_game* game, t_pos* pos);
static int
	is_combatant_sprite(t_game* game, t_sprite* sprite);
static void
	open_doors(t_game* game);

/* ************************************************************************** */
// 全戦闘員の足元セルを見て、ゴール到達と収集を処理する。1vs1 では「先にゴールへ
// 入った戦闘員」が勝者になるため、カメラ1点ではなく席ごとに判定する（G-06）。
// マップ由来の敵ハザードは席ではないので対象外。死亡中（復帰待ち）の席も対象外:
// 同じティックの接触死（combat が check_quest より先に走る）で死んだ席が
// そのままゴール・収集できると「死にながら勝つ」が起きる。同一ティックに複数が
// ゴールへ入った場合はリスト順で先の1体が勝者になる（サーバ権威なので再現性はある）
void
	check_quest(t_game* game)
{
	t_enemy*	cur;

	cur = game->world.enemies;
	while (cur) {
		if (!cur->is_hazard && cur->death_timer <= 0.0) {
			check_combatant_quest(game, cur);
		}
		cur = cur->next;
	}
}

/* ************************************************************************** */
// 戦闘員1体ぶんの足元判定。ゴールと収集はセルの文字が排他なので else if でよい
static void
	check_combatant_quest(t_game* game, t_enemy* combatant)
{
	t_pos*	pos;

	pos = &combatant->sprite->pos;
	if (game->mode == MODE_FPS && IS_GOAL(MAP((*pos), game->config))) {
		reach_goal(game, combatant);
	} else if (IS_COLLECTIBLE(MAP((*pos), game->config))) {
		collect_item(game, pos);
	}
}

/* ************************************************************************** */
// ゴール到達で試合を終了し、勝者をその戦闘員に確定する
// （② §5-C: FPS の match.winner は combatant_id）。クリア時間は従来どおり記録する
static void
	reach_goal(t_game* game, t_enemy* combatant)
{
	if (game->cleared) {
		return ;
	}
	game->fps.clear_time_ms = get_current_time_ms() - game->start_time_ms;
	if (game->fps.clear_time_ms < 0) {
		game->fps.clear_time_ms = 0;
	}
	game->fps.winner = combatant->combatant_id;
	game->cleared = 1;
}

/* ************************************************************************** */
// アイテムを1つ収集する。収集数はワールド共通のカウンタで、扉 D の開放も全戦闘員
// の合計で判定する（① §4-C の「収集→扉開放は関門として現行仕様を維持」）
static void
	collect_item(t_game* game, t_pos* pos)
{
	MAP((*pos), game->config) = 'A';
	game->world.collected++;
	delete_item_sprite(game, pos);
	if (game->world.to_collect > 0 && game->world.collected >= game->world.to_collect) {
		open_doors(game);
	}
}

/* ************************************************************************** */
// 収集セル上のアイテムスプライトだけを消す。マス一致で最初の1つを消すと、
// サーバ実行では同じマスに立つ戦闘員の身体（席の sprite も world.sprites に
// 繋がり、しかもリスト先頭側に居る）を解放してノードのポインタが宙に浮く
static void
	delete_item_sprite(t_game* game, t_pos* pos)
{
	t_sprite*	cur;

	cur = game->world.sprites;
	while (cur) {
		if ((int)cur->pos.x == (int)pos->x && (int)cur->pos.y == (int)pos->y
			&& !is_combatant_sprite(game, cur)) {
			delete_sprite_node(&game->world.sprites, cur);
			return ;
		}
		cur = cur->next;
	}
}

/* ************************************************************************** */
// スプライトがいずれかの戦闘員に所有されているかを返す
static int
	is_combatant_sprite(t_game* game, t_sprite* sprite)
{
	t_enemy*	cur;

	cur = game->world.enemies;
	while (cur) {
		if (cur->sprite == sprite) {
			return (1);
		}
		cur = cur->next;
	}
	return (0);
}

/* ************************************************************************** */
// マップ上に存在する収集アイテムの総数を数える
void
	count_items(t_game* game)
{
	int	i;
	int	j;

	game->world.to_collect = 0;
	i = 0;
	while (i < game->config.map.rows) {
		j = 0;
		while (j < game->config.map.columns) {
			if (IS_COLLECTIBLE(MAP_XY(j, i, game->config))) {
				game->world.to_collect++;
			}
			j++;
		}
		i++;
	}
}

/* ************************************************************************** */
// 収集完了時に呼ばれ、マップ上の全ての扉(D)を床('0')へ書き換えて開放する
static void
	open_doors(t_game* game)
{
	int	total;
	int	i;

	total = game->config.map.rows * game->config.map.columns;
	i = 0;
	while (i < total) {
		if (game->config.map.data[i] == DOOR_CHAR) {
			game->config.map.data[i] = '0';
		}
		i++;
	}
}
