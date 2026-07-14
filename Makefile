NAME            = cub3D
CC              = gcc
RM              = rm -rf

# ==============================================================================
# ディレクトリ設定（srcs を common / fps / rsp の3系統に分割）
# ==============================================================================
INC_DIR         = codes/includes
OBJ_DIR         = codes/obj
COMMON_DIR      = codes/srcs/common
FPS_DIR         = codes/srcs/fps
RSP_DIR         = codes/srcs/rsp
PLATFORM_NATIVE_DIR = codes/srcs/platform/native
PLATFORM_WEB_DIR = codes/srcs/platform/web
WEB_BUILD_DIR   = web/build
WEB_ASSET_DIR   = web/assets

# ------------------------------------------------------------------------------
# コンパイルフラグ（ヘッダは codes/includes に集約。rsp 系も codes/includes/rsp 配下）
# ------------------------------------------------------------------------------
CFLAGS          = -O2 -Wall -Wextra -Werror -pthread -I $(INC_DIR) -I $(MLX_DIR)
CHECKS          = no-42-header,includes,style,pointer,signatures,separators,header-guard,static-leak,missing-static,layering,duplicates,unused,return-parens

# ==============================================================================
# ソース定義
# ==============================================================================
COMMON_SRCS     = main.c \
                  config/config.c config/parse_map.c config/check_map.c \
                  config/parse_params.c config/parse_texture.c \
                  utils/ft_strlen.c utils/ft_substr.c utils/ft_in_set.c \
                  utils/str.c utils/ft_strdup.c utils/ft_split.c utils/ft_atoi.c \
                  utils/pos.c utils/ft_strcmp.c utils/ft_rand.c \
                  utils/ft_write.c utils/ft_endswith.c \
                  gnl/get_next_line.c gnl/get_next_line_utils.c \
                  engine/raycast/camera.c engine/raycast/raycast.c \
                  engine/raycast/spawn.c engine/raycast/spawn_marker.c \
                  engine/render/draw.c engine/render/draw_wall.c \
                  engine/render/draw_sky_floor.c engine/render/screen.c \
                  engine/render/sprite.c engine/render/sprite_utils.c \
                  engine/render/cast_columns.c engine/render/light.c \
                  engine/render/tables.c engine/render/draw_weapon.c \
                  engine/texture/color.c engine/texture/texture.c \
                  engine/input/input.c \
                  core/collision.c core/bmp.c \
                  core/loop.c core/init.c core/exit.c core/respawn.c \
                  enemy/enemy.c \
                  enemy/enemy_path.c enemy/enemy_move.c enemy/enemy_patrol.c \
                  ui/font.c ui/ui.c ui/crosshair.c

FPS_SRCS        = core/fps_shoot.c core/fps_item.c core/fps_respawn.c \
                  core/fps_mode.c core/fps_assets.c \
                  enemy/fps_enemy_ai.c enemy/fps_enemy_assets.c \
                  enemy/fps_enemy_sense.c \
                  render/fps_weapon.c

RSP_SRCS        = core/rsp_mode.c core/rsp_setup.c core/rsp_assets.c \
                  core/rsp_rule.c core/rsp_combat.c \
                  enemy/rsp_enemy_ai.c \
                  render/rsp_weapon.c

NATIVE_PLATFORM_SRCS = platform_native.c
WEB_PLATFORM_SRCS = platform_web.c web_main.c
WEB_COMMON_SRCS = $(filter-out main.c, $(COMMON_SRCS))
WEB_SRCS        = $(addprefix $(COMMON_DIR)/, $(WEB_COMMON_SRCS)) \
                  $(addprefix $(FPS_DIR)/, $(FPS_SRCS)) \
                  $(addprefix $(RSP_DIR)/, $(RSP_SRCS)) \
                  $(addprefix $(PLATFORM_WEB_DIR)/, $(WEB_PLATFORM_SRCS))

OBJS            = $(addprefix $(OBJ_DIR)/common/, $(COMMON_SRCS:.c=.o)) \
                  $(addprefix $(OBJ_DIR)/fps/, $(FPS_SRCS:.c=.o)) \
                  $(addprefix $(OBJ_DIR)/rsp/, $(RSP_SRCS:.c=.o)) \
                  $(addprefix $(OBJ_DIR)/platform/native/, $(NATIVE_PLATFORM_SRCS:.c=.o))

# ==============================================================================
# Linux(X11) ライブラリ設定
# ==============================================================================
MLX_DIR         = codes/minilibx-linux
LIBS            = -L$(MLX_DIR) -lmlx -L/usr/lib -lXext -lX11 -lm -lz
MLX_TARGET      = $(MLX_DIR)/libmlx.a
WEB_CFLAGS      = -O2 -Wall -Wextra -Werror -DWEB_BUILD -I $(INC_DIR)
WEB_LDFLAGS     = -O2 -sALLOW_MEMORY_GROWTH=1 -sTEXTDECODER=1 -sFORCE_FILESYSTEM=1 \
                  -sMODULARIZE=1 -sEXPORT_NAME=createCub3DModule -sENVIRONMENT=web,node \
                  -sEXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPU8"]' \
                  -sEXPORTED_FUNCTIONS='["_web_init","_web_render","_web_framebuffer_ptr","_web_framebuffer_width","_web_framebuffer_height","_web_framebuffer_stride","_web_register_texture","_malloc","_free"]' \
                  --preload-file maps/fps_map/1.cub@/maps/fps_map/1.cub

# ==============================================================================
# ビルドルール（root ごとに1つずつ）
# ==============================================================================
all:            $(NAME)

$(NAME):        $(MLX_TARGET) $(OBJS)
	$(CC) $(CFLAGS) -o $(NAME) $(OBJS) $(LIBS)

$(OBJ_DIR)/common/%.o: $(COMMON_DIR)/%.c
	@mkdir -p $(@D)
	$(CC) $(CFLAGS) -c $< -o $@

$(OBJ_DIR)/fps/%.o: $(FPS_DIR)/%.c
	@mkdir -p $(@D)
	$(CC) $(CFLAGS) -c $< -o $@

$(OBJ_DIR)/rsp/%.o: $(RSP_DIR)/%.c
	@mkdir -p $(@D)
	$(CC) $(CFLAGS) -c $< -o $@

$(OBJ_DIR)/platform/native/%.o: $(PLATFORM_NATIVE_DIR)/%.c
	@mkdir -p $(@D)
	$(CC) $(CFLAGS) -c $< -o $@

$(MLX_TARGET):
	@$(MAKE) -C $(MLX_DIR)

# ==============================================================================
# デバッグ / 品質担保 / クリーン
# ==============================================================================
debug:          CFLAGS += -O0 -g3 -fsanitize=address -static-libasan
debug:          re

web-assets:
	python3 codes/PythonCodes/xpm_to_tex.py textures $(WEB_ASSET_DIR)

web:            web-assets $(WEB_BUILD_DIR)/render.js

$(WEB_BUILD_DIR)/render.js: $(WEB_SRCS)
	@mkdir -p $(WEB_BUILD_DIR)
	bash -lc "source ~/emsdk/emsdk_env.sh >/dev/null && emcc $(WEB_CFLAGS) $(WEB_SRCS) -o $@ $(WEB_LDFLAGS)"

check:
	@python3 codes/PythonCodes/lint.py --select $(CHECKS) --strict

audit:
	@python3 codes/PythonCodes/lint.py

clean:
	-@$(MAKE) -C $(MLX_DIR) clean
	$(RM) $(OBJ_DIR)

fclean:         clean
	$(RM) $(NAME)

re:             fclean all

.PHONY:         all clean fclean re check audit debug web web-assets
