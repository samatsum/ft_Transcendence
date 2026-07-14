#include "engine/render/render.h" /* t_sprite / t_camera 宣言・malloc(utils 経由) のため */

/* ************************************************************************** */
t_sprite*
	sort_sprites(t_camera* camera, t_sprite* sprites);
static t_sprite*
	add_sorted_sprite(t_sprite** sorted, t_sprite* sprite);
t_sprite*
	add_front_sprite(t_sprite** sprites, double distance, t_pos* pos, t_tex* tex);
void
	delete_sprite(t_sprite** sprites, t_pos* pos);
void
	delete_sprite_node(t_sprite** sprites, t_sprite* target);
void
	clear_sprites(t_sprite** sprites);
void
	sprite_transform(t_camera* camera, double inv_det, t_pos world, t_pos* out);

/* ************************************************************************** */
// 全スプライトをカメラからの距離順に並べた新リスト(sorted リンクで連結)を返す。各スプライトの
// distance にはカメラとの二乗距離を入れる。並べ替えに必要なのは大小関係だけなので、sqrt を省いて
// 二乗のまま比較する(描画側で必要時に sqrt する)
t_sprite*
	sort_sprites(t_camera* camera, t_sprite* sprites)
{
	t_sprite*	sorted;
	t_pos		p;

	sorted = NULL;
	copy_pos(&p, &camera->pos);
	while (sprites) {
		sprites->distance = ((p.x - sprites->pos.x) * (p.x - sprites->pos.x) + (p.y - sprites->pos.y) * (p.y - sprites->pos.y));
		sprites->sorted = NULL;
		add_sorted_sprite(&sorted, sprites);
		sprites = sprites->next;
	}
	return (sorted);
}

/* ************************************************************************** */
// スプライトを距離の降順(遠い順)になるよう sorted リストへ挿入する。新スプライトより遠いノードを
// 読み飛ばし、最初に「同じか近い」ノードの直前へ繋ぐ。これにより描画側が先頭から順に描けば
// 遠→近の重ね順(ペインターズアルゴリズム)になる。previous が NULL なら先頭挿入
static t_sprite*
	add_sorted_sprite(t_sprite** sorted, t_sprite* sprite)
{
	t_sprite*	first;
	t_sprite*	previous;

	if (!*sorted) {
		*sorted = sprite;
		return (*sorted);
	}
	first = *sorted;
	previous = NULL;
	while (*sorted && sprite->distance < (*sorted)->distance) {
		previous = *sorted;
		*sorted = (*sorted)->sorted;
	}
	if (!previous) {
		sprite->sorted = *sorted;
		*sorted = sprite;
	} else {
		sprite->sorted = previous->sorted;
		previous->sorted = sprite;
		*sorted = first;
	}
	return (sprite);
}

/* ************************************************************************** */
// next リストの先頭へ新しいスプライトを追加する。位置・距離・テクスチャを設定して連結し、
// 確保した新ノードを返す。malloc 失敗時は NULL
t_sprite*
	add_front_sprite(t_sprite** sprites, double distance, t_pos* pos, t_tex* tex)
{
	t_sprite*	new;

	new = (t_sprite*)malloc(sizeof(*new));
	if (!new) {
		return (NULL);
	}
	copy_pos(&new->pos, pos);
	new->distance = distance;
	new->next = *sprites;
	new->tex = tex;
	*sprites = new;
	return (new);
}

/* ************************************************************************** */
// pos と同じマス(整数座標)にあるスプライトを next リストから1つ削除して解放する。アイテム収集
// などで対象が消えたときに使う。先頭を退避し、削除後にリスト先頭を復元してから戻る
void
	delete_sprite(t_sprite** sprites, t_pos* pos)
{
	t_sprite*	tmp;
	t_sprite*	previous;
	t_sprite*	first;

	first = *sprites;
	previous = NULL;
	while (*sprites) {
		if ((int)(*sprites)->pos.x == (int)pos->x && (int)(*sprites)->pos.y == (int)pos->y) {
			tmp = *sprites;
			if (!previous) {
				*sprites = tmp->next;
			} else {
				previous->next = tmp->next;
			}
			free(tmp);
			if (previous) {
				*sprites = first;
			}
			return ;
		}
		previous = *sprites;
		*sprites = (*sprites)->next;
	}
	*sprites = first;
}

/* ************************************************************************** */
// target と同じポインタのスプライトを next リストから削除して解放する
void
	delete_sprite_node(t_sprite** sprites, t_sprite* target)
{
	t_sprite*	cur;
	t_sprite*	prev;

	cur = *sprites;
	prev = NULL;
	while (cur) {
		if (cur == target) {
			if (!prev) {
				*sprites = cur->next;
			} else {
				prev->next = cur->next;
			}
			free(cur);
			return ;
		}
		prev = cur;
		cur = cur->next;
	}
}

/* ************************************************************************** */
// next リストを辿って全スプライトを解放し、最後に頭を NULL にする(終了時のクリーンアップ)
void
	clear_sprites(t_sprite** sprites)
{
	t_sprite*	tmp;

	while (*sprites) {
		tmp = (*sprites)->next;
		free(*sprites);
		*sprites = tmp;
	}
	*sprites = NULL;
}

/* ************************************************************************** */
// ワールド点 world をカメラ空間 out へ射影する(スプライト/ビルボードの位置決め)。inv_det は
// カメラ行列の逆行列式で、呼び出し側が1度求めて使い回す。out.y が奥行き(>0で前方)、out.x が
// 横ずれ。描画(init_draw_sprite)と射撃の当たり判定(check_hit)が同一の変換を共有するための関数
void
	sprite_transform(t_camera* camera, double inv_det, t_pos world, t_pos* out)
{
	t_pos	rel;

	rel.x = world.x - camera->pos.x;
	rel.y = world.y - camera->pos.y;
	out->x = inv_det * (camera->dir.y * rel.x - camera->dir.x * rel.y);
	out->y = inv_det * (-camera->plane.y * rel.x + camera->plane.x * rel.y);
}
