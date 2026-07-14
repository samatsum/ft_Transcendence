#ifndef PLATFORM_H
# define PLATFORM_H

# include <stddef.h>
# include <stdint.h>

/* ************************************************************************** */
// フレームバッファ。描画層はこの4項目だけを見てピクセルを書き込む
typedef struct s_framebuffer
{
	void*	pixels;
	int		width;
	int		height;
	int		stride;
}	t_framebuffer;

/* ************************************************************************** */
// platform API が参照する型の前方宣言
struct s_game;
struct s_input;
struct s_tex;
struct s_window;

/* ************************************************************************** */
// プラットフォーム境界。native/web/headless がこの関数群を実装する
int
	pf_init(struct s_window* window, int width, int height, const char* title);
int
	pf_create_framebuffer(struct s_window* window);
void
	pf_present(struct s_window* window);
int64_t
	pf_now_ms(void);
int
	pf_load_texture(struct s_window* window, struct s_tex* tex);
void
	pf_destroy_texture(struct s_window* window, struct s_tex* tex);
void
	pf_poll_events(struct s_input* input);
void
	pf_setup_hooks(struct s_game* game);
void
	pf_loop(struct s_window* window);
void
	pf_shutdown(struct s_window* window);
/* ************************************************************************** */
// JS から呼ぶ render.wasm の最小公開 API
int
	web_register_texture(const char* path, const unsigned char* rgba, int width, int height);
int
	web_init(void);
int
	web_render(double delta_time);
int
	web_framebuffer_ptr(void);
int
	web_framebuffer_width(void);
int
	web_framebuffer_height(void);
int
	web_framebuffer_stride(void);

#endif
