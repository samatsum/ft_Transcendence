#include "engine/raycast/raycast.h"
#include "config/config.h"     /* MAP_XY / DIRECTIONS / MAX_SPAWNS 等のマクロ展開のため */

/* ************************************************************************** */
void
	collect_spawns(t_config* config);
void
	apply_spawn(t_config* config, t_camera* camera, t_spawn_point* sp);
int
	pick_spawn_index(t_config* config, const char* allowed, unsigned int* seed);
int
	pick_spawn_indices(t_config* config, const char* allowed, unsigned int* seed, int* out, int want);

/* ************************************************************************** */
// マップ全体を1度走査し、N/S/E/W のセルを位置と向き文字つきで spawns[] へ全収集する。
// 位置はマス中心になるよう +0.5 する。スポーン文字は移動時に 'A'(訪問済み)へ潰さない方針
// なので、起動時に1度呼べば以後の選び直し(リスポーン)でも使い回せる。上限は MAX_SPAWNS
void
	collect_spawns(t_config* config)
{
	t_pos	pos;
	char	c;

	config->spawn_count = 0;
	pos.y = 0;
	while (pos.y < config->map.rows) {
		pos.x = 0;
		while (pos.x < config->map.columns) {
			c = (char)MAP_XY(pos.x, pos.y, *config);
			if (ft_in_set(c, DIRECTIONS) && config->spawn_count < MAX_SPAWNS) {
				set_pos(&config->spawns[config->spawn_count].pos, pos.x + .5, pos.y + .5);
				config->spawns[config->spawn_count].dir = c;
				config->spawn_count++;
			}
			pos.x++;
		}
		pos.y++;
	}
}

/* ************************************************************************** */
// スポーン地点1つをカメラへ適用する。位置 pos を写し、向き文字 N/E/S/W に応じて視線 dir と
// カメラ平面 plane を設定する（plane の大きさ＝fov で視野角を決める）。最後に直交ベクトル
// x_dir を dir から導出(90度回転)してストレイフ移動に備える。マップ文字は書き換えない
void
	apply_spawn(t_config* config, t_camera* camera, t_spawn_point* sp)
{
	copy_pos(&camera->pos, &sp->pos);
	if (sp->dir == 'N') {
		set_pos(&camera->dir, 0., -1.);
		set_pos(&camera->plane, config->fov, 0.);
	} else if (sp->dir == 'E') {
		set_pos(&camera->dir, 1., 0.);
		set_pos(&camera->plane, 0., config->fov);
	} else if (sp->dir == 'S') {
		set_pos(&camera->dir, 0., 1.);
		set_pos(&camera->plane, -config->fov, 0.);
	} else if (sp->dir == 'W') {
		set_pos(&camera->dir, -1., 0.);
		set_pos(&camera->plane, 0., -config->fov);
	}
	set_pos(&camera->x_dir, camera->dir.y, -camera->dir.x);
}

/* ************************************************************************** */
// spawns[] のうち allowed に含まれる向き文字の地点を候補に集め、その中から1つを乱数
// (自作 ft_rand で seed を更新する再入可能な擬似乱数)で選んで添字を返す。allowed=DIRECTIONS なら
// 全スポーンが対象(FPSの初期配置)。候補が無ければ -1 を返し、呼び出し側で配置失敗を扱う
int
	pick_spawn_index(t_config* config, const char* allowed, unsigned int* seed)
{
	int	candidates[MAX_SPAWNS];
	int	count;
	int	i;

	count = 0;
	i = 0;
	while (i < config->spawn_count) {
		if (ft_in_set(config->spawns[i].dir, allowed)) {
			candidates[count++] = i;
		}
		i++;
	}
	if (count == 0) {
		return (-1);
	}
	return (candidates[(int)((unsigned int)ft_rand(seed) % (unsigned int)count)]);
}

/* ************************************************************************** */
// allowed に該当する地点から重複なしで最大 want 個を乱数で選び out[] へ格納し、選べた個数を
// 返す。選んだ候補を末尾要素と入れ替えてから候補数を1減らすことで、同じ地点の二重選出を
// O(1)で防ぐ（フィッシャー＝イェーツの部分抽出）。RSPのチーム別2地点選出(赤"NW"/青"SE")に使う
int
	pick_spawn_indices(t_config* config, const char* allowed, unsigned int* seed, int* out, int want)
{
	int	cand[MAX_SPAWNS];
	int	count;
	int	i;
	int	picked;
	int	r;

	count = 0;
	i = 0;
	while (i < config->spawn_count) {
		if (ft_in_set(config->spawns[i].dir, allowed)) {
			cand[count++] = i;
		}
		i++;
	}
	picked = 0;
	while (picked < want && count > 0) {
		r = (int)((unsigned int)ft_rand(seed) % (unsigned int)count);
		out[picked++] = cand[r];
		count--;
		cand[r] = cand[count];
	}
	return (picked);
}
