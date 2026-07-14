#include <sys/time.h> /* gettimeofday, struct timeval 用 */
#include <time.h>     /* time_t, localtime, struct tm 用 */
#include <fcntl.h>    /* open, O_CREAT 等 用 */
#include <unistd.h>   /* write, close 用 */
#include "core/core.h"
#include "utils/utils.h" /* ft_write_str, ft_write_int 用 */
#include "tuning.h"

#define SCREENSHOT_FILE_MODE 0644
#define FPS_SCREENSHOT_PREFIX "./screenshot/fps_screen/fps_"
#define RSP_SCREENSHOT_PREFIX "./screenshot/rsp_screen/rsp_"

/* ************************************************************************** */
int
	save_result_screenshot(t_game* game);
static int
	save_screenshot_file(t_game* game);
static int
	save_bmp(t_game* game, int fd);
static void
	get_screenshot_path(t_game* game, char* buffer);
static const char*
	screenshot_prefix(t_game* game);
static int
	write_padded_int(char* buffer, int value, int start, int width);
static int
	write_bmp_header(int fd, int filesize, t_game* game);
static void
	set_int_in_char(unsigned char* start, int value);
static int
	write_bmp_data(int file, t_window* w, int pad);
static int
	get_color(t_window* w, int x, int y);

/* ************************************************************************** */
// FPS/RSP の結果画面を、モード別の screenshot サブディレクトリへ保存する
int
	save_result_screenshot(t_game* game)
{
	return (save_screenshot_file(game));
}

/* ************************************************************************** */
// 現在の画面バッファを、モードに応じた日時付きBMPファイルとして保存する
static int
	save_screenshot_file(t_game* game)
{
	int		fd;
	char	filepath[256];

	get_screenshot_path(game, filepath);
	fd = open(filepath, O_CREAT | O_WRONLY | O_TRUNC, SCREENSHOT_FILE_MODE);
	if (fd < 0) {
		return (0);
	}
	if (!save_bmp(game, fd)) {
		close(fd);
		return (0);
	}
	close(fd);
	return (1);
}

/* ************************************************************************** */
// 呼び出し側が開いた fd へ画面ピクセルを24bit BMP として書き出す
static int
	save_bmp(t_game* game, int fd)
{
	t_window*	w;
	int			filesize;
	int			pad;

	w = &game->window;
	pad = (4 - ((int)w->size.x * 3) % 4) % 4;
	filesize = 54 + (3 * ((int)w->size.x + pad) * (int)w->size.y);
	if (!write_bmp_header(fd, filesize, game)) {
		return (0);
	}
	if (!write_bmp_data(fd, w, pad)) {
		return (0);
	}
	return (1);
}

/* ************************************************************************** */
// 撮影時刻をローカル日時へ変換し、目で読めるファイル名を作る。
// 例: ./screenshot/fps_screen/fps_20260707_213045_123456.bmp
// 末尾のマイクロ秒は、同じ秒に複数回保存した場合の上書き防止に使う
static void
	get_screenshot_path(t_game* game, char* buffer)
{
	struct timeval	tv;
	time_t			seconds;
	struct tm*		now;
	int				i;

	gettimeofday(&tv, NULL);
	seconds = (time_t)tv.tv_sec;
	now = localtime(&seconds);
	i = ft_write_str(buffer, (char*)screenshot_prefix(game), 0);
	if (!now) {
		i = ft_write_str(buffer, "unix_", i);
		i = ft_write_int(buffer, (int)tv.tv_sec, i);
		i = ft_write_str(buffer, "_", i);
		i = write_padded_int(buffer, (int)tv.tv_usec, i, 6);
		ft_write_str(buffer, ".bmp", i);
		return ;
	}
	i = write_padded_int(buffer, now->tm_year + 1900, i, 4);
	i = write_padded_int(buffer, now->tm_mon + 1, i, 2);
	i = write_padded_int(buffer, now->tm_mday, i, 2);
	i = ft_write_str(buffer, "_", i);
	i = write_padded_int(buffer, now->tm_hour, i, 2);
	i = write_padded_int(buffer, now->tm_min, i, 2);
	i = write_padded_int(buffer, now->tm_sec, i, 2);
	i = ft_write_str(buffer, "_", i);
	i = write_padded_int(buffer, (int)tv.tv_usec, i, 6);
	ft_write_str(buffer, ".bmp", i);
}

/* ************************************************************************** */
// 実行モードに応じて保存先ディレクトリのprefixを返す
static const char*
	screenshot_prefix(t_game* game)
{
	if (game->mode == MODE_RSP) {
		return (RSP_SCREENSHOT_PREFIX);
	}
	return (FPS_SCREENSHOT_PREFIX);
}

/* ************************************************************************** */
// 数値を指定幅まで 0 埋めして追記する。日時の桁数を固定し、ファイル一覧で時系列に並べやすくする
static int
	write_padded_int(char* buffer, int value, int start, int width)
{
	int	div;

	div = 1;
	while (width > 1) {
		div *= 10;
		width--;
	}
	while (div > 0) {
		buffer[start++] = '0' + (value / div) % 10;
		div /= 10;
	}
	buffer[start] = 0;
	return (start);
}

/* ************************************************************************** */
// BMP の54バイトヘッダを組み立てて書く
static int
	write_bmp_header(int fd, int filesize, t_game* game)
{
	int				i;
	int				tmp;
	unsigned char	bmpfileheader[54];

	i = 0;
	while (i < 54) {
		bmpfileheader[i++] = (unsigned char)(0);
	}
	bmpfileheader[0] = (unsigned char)('B');
	bmpfileheader[1] = (unsigned char)('M');
	set_int_in_char(bmpfileheader + 2, filesize);
	bmpfileheader[10] = (unsigned char)(54);
	bmpfileheader[14] = (unsigned char)(40);
	tmp = game->window.size.x;
	set_int_in_char(bmpfileheader + 18, tmp);
	tmp = game->window.size.y;
	set_int_in_char(bmpfileheader + 22, tmp);
	bmpfileheader[27] = (unsigned char)(1);
	bmpfileheader[28] = (unsigned char)(24);
	return (!(write(fd, bmpfileheader, 54) < 0));
}

/* ************************************************************************** */
// 32bit 整数を start から4バイトにリトルエンディアンで書き込む
static void
	set_int_in_char(unsigned char* start, int value)
{
	start[0] = (unsigned char)(value);
	start[1] = (unsigned char)(value >> 8);
	start[2] = (unsigned char)(value >> 16);
	start[3] = (unsigned char)(value >> 24);
}

/* ************************************************************************** */
// 画面ピクセルを BMP のデータ領域として1行ずつ書き出す
static int
	write_bmp_data(int file, t_window* w, int pad)
{
	const unsigned char	zero[3] = {0, 0, 0};
	int					i;
	int					j;
	int					color;

	i = 0;
	while (i < (int)w->size.y) {
		j = 0;
		while (j < (int)w->size.x) {
			color = get_color(w, j, i);
			if (write(file, &color, 3) < 0) {
				return (0);
			}
			if (pad > 0 && write(file, &zero, pad) < 0) {
				return (0);
			}
			j++;
		}
		i++;
	}
	return (1);
}

/* ************************************************************************** */
// 画面バッファから (x, y) のピクセル色を取得する
static int
	get_color(t_window* w, int x, int y)
{
	int	rgb;
	int	color;

	color = *(int*)(w->screen.ptr + (BYTES_PER_PIXEL * (int)w->size.x * ((int)w->size.y - 1 - y)) + (BYTES_PER_PIXEL * x));
	rgb = color & 0xFFFFFF;
	return (rgb);
}
