#include <pthread.h>           /* pthread_create / pthread_join 用 */
#include <unistd.h>            /* sysconf(_SC_NPROCESSORS_ONLN) 用 */
#include <math.h>              /* fabs 用 */
#include "engine/render/render.h"
#include "engine/raycast/raycast.h"

/* ************************************************************************** */
// 同時に走らせるワーカースレッドの上限。実行時は min(オンラインCPUコア数,
// この値, 画面幅) を採用し、1 のときはスレッドを使わず逐次実行に落とす
#define RENDER_THREADS_MAX	16

/* ************************************************************************** */
void
	cast_columns(t_render* rnd, double* camera_x);
static int
	worker_count(int columns);
static void*
	cast_worker(void* arg);
static void
	cast_range(t_render* rnd, double* camera_x, int start, int end);

/* ************************************************************************** */
// 画面の全列を worker_count 個のワーカーへ均等分割し、並列にレイキャスト描画する司令塔。
// 各ジョブに担当列範囲[start,end)を詰めてスレッドを起こし、生成できた分だけ created[] に印を
// 付ける。n==1 や pthread_create 失敗時はその場で cast_range を呼んで逐次フォールバックする。
// 列ごとに書き込み先が重ならないので、描画自体はミューテックスなしで安全。最後に join で待つ
void
	cast_columns(t_render* rnd, double* camera_x)
{
	pthread_t		tid[RENDER_THREADS_MAX];
	t_render_job	jobs[RENDER_THREADS_MAX];
	int				created[RENDER_THREADS_MAX];
	int				cols;
	int				n;
	int				i;

	cols = (int)rnd->w->size.x;
	n = worker_count(cols);
	i = 0;
	while (i < n) {
		jobs[i].rnd = rnd;
		jobs[i].camera_x = camera_x;
		jobs[i].start = (cols * i) / n;
		jobs[i].end = (cols * (i + 1)) / n;
		created[i] = 0;
		if (n > 1 && pthread_create(&tid[i], NULL, &cast_worker, &jobs[i]) == 0) {
			created[i] = 1;
		} else {
			cast_range(rnd, camera_x, jobs[i].start, jobs[i].end);
		}
		i++;
	}
	i = 0;
	while (i < n) {
		if (created[i]) {
			pthread_join(tid[i], NULL);
		}
		i++;
	}
}

/* ************************************************************************** */
// 起動するワーカー数を決める。オンラインCPUコア数を基準に、スレッド上限と列数で頭打ちし、
// 必ず1以上に丸める（1コア＝逐次実行、列数より多くスレッドを作っても無駄なので列数で制限）
static int
	worker_count(int columns)
{
	long	cores;
	int		n;

	cores = sysconf(_SC_NPROCESSORS_ONLN);
	if (cores < 1) {
		cores = 1;
	}
	n = (int)cores;
	if (n > RENDER_THREADS_MAX) {
		n = RENDER_THREADS_MAX;
	}
	if (n > columns) {
		n = columns;
	}
	if (n < 1) {
		n = 1;
	}
	return (n);
}

/* ************************************************************************** */
// pthread から呼ばれる入口。void* 引数を t_render_job* へ戻し、担当列範囲を取り出して
// 描画本体 cast_range へ委譲する。pthread の規約に合わせ戻り値は NULL
static void*
	cast_worker(void* arg)
{
	t_render_job*	job;

	job = (t_render_job*)arg;
	cast_range(job->rnd, job->camera_x, job->start, job->end);
	return (NULL);
}

/* ************************************************************************** */
// 列範囲[start,end)だけを描画する実体。列ごとに ray_cast で壁までの距離を求めて depth[] に
// 記録し(後段のスプライト前後判定に使う)、距離から壁の画面上の高さを算出して壁を描く。
// 壁が画面を埋め尽くさない(height < 画面高)ときだけ、残る上下に天井と床を描く
static void
	cast_range(t_render* rnd, double* camera_x, int start, int end)
{
	t_ray	ray;
	int			i;

	i = start;
	while (i < end) {
		ray.column = i;
		ray_cast(rnd->camera, rnd->config, &ray, camera_x[i]);
		rnd->depth[i] = ray.distance;
		ray.height = fabs(rnd->w->size.y / ray.distance);
		draw_wall(rnd, &ray);
		if (ray.height < rnd->w->size.y) {
			draw_sky_floor(rnd, &ray);
		}
		i++;
	}
}
