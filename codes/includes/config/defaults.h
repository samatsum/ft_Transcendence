#ifndef DEFAULTS_H
# define DEFAULTS_H

/* ************************************************************************** */
// プレイヤー／カメラの初期パラメータ（.cub の MS / RS / FOV で上書き可能）
# define DEFAULT_MOVE_SPEED			0.05
# define DEFAULT_ROTATE_SPEED		0.05
# define DEFAULT_FOV				0.66

/* ************************************************************************** */
// 敵AIの初期パラメータ（.cub の ET / ES / EH で上書き可能）
// ENEMY_SPEED は基準移動速度、ENEMY_HP は撃破に要するヒット数（整数として扱う）
# define DEFAULT_ENEMY_TRACK_SECONDS	5.0
# define DEFAULT_ENEMY_SPEED			0.1
# define DEFAULT_ENEMY_HP				5.0

/* ************************************************************************** */

#endif
