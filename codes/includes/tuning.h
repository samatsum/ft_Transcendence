#ifndef TUNING_H
# define TUNING_H

/* ************************************************************************** */
// ゲーム挙動のチューニング値（コンパイル時のみ。実行時の上書きは不可）
// プレイヤーの速度倍率（config->move_speed への係数）。素手(3キー)装備で走行モードに
// なり、歩行の PLAYER_RUN_BOOST 倍速で動く。速さの比率は PLAYER_RUN_BOOST だけで調整できる
# define PLAYER_RUN_BOOST		1.5
# define PLAYER_WALK_SPEED_MULT	1.0
# define PLAYER_RUN_SPEED_MULT	(PLAYER_WALK_SPEED_MULT * PLAYER_RUN_BOOST)
# define TARGET_FPS				60.0
# define MAX_TIME_MULT			3.0
// エンティティ(プレイヤー)の当たり半径。(動くものとの当たり半径)
# define PLAYER_RADIUS			0.5

// 敵の当たり半径（動くものとの当たり半径)
# define ENEMY_RADIUS			0.8

// プレイヤー/NPC共通の壁当たりマージン[マス]。進行方向の壁の手前このぶん中心を
// 止め、壁へ食い込むのを防ぐ（壁判定が点だと中心がマス境界まで寄れて埋まって
// 見える）。0=点判定、大きいほど壁から離れる。床マス中心へ届くよう 0.5 未満にする
# define WALL_MARGIN			0.4

// 敵との接触とみなす中心間距離[マス]。当たり判定はプレイヤーと敵を
// max(PLAYER_RADIUS, ENEMY_RADIUS)=0.8 マス以内に近づけないため、この値は
// それより大きく取る（小さいと永遠に発火しない）。0.9 はどちら側が距離を
// 詰めても接触として検出できる最小限の余裕値
# define RESPAWN_CONTACT_DIST	0.9

// プレイヤー死亡から自動リスポーンまでの待機秒数。この間は死亡画像を全画面表示し、
// 入力・敵更新を停止する。値を変えるだけで演出の長さを調整できる
# define DEATH_DURATION			5.0

// 死亡時に全画面表示する画像のパス（UI を含む全レイヤーの上から重ねる）
# define DEATH_TEX_PATH			"textures/full/Full_youdied.xpm"

// 扉(ドア)のテクスチャ。defineを書き換えるだけで別の扉画像へ差し替えられる
# define DOOR_TEX_PATH          "textures/interact/Interact_DOOR_3.xpm"

// FPSゴール地点に表示するスプライト画像
# define GOAL_TEX_PATH			"textures/Goal.xpm"

/* ************************************************************************** */
// 敵の移動速度倍率（基準 enemy_speed に対する係数）と巡回の到達判定しきい値。
// ARRIVE は1フレームの巡回移動量(enemy_speed*PATROL*MAX_TIME_MULT)より大きく取る。
// 追跡倍率は巡回倍率に ENEMY_TRACK_BOOST を掛けて導出する。
// 速さの比率を変えたいときは ENEMY_TRACK_BOOST だけを調整すればよい
# define ENEMY_TRACK_BOOST			1.5
# define ENEMY_PATROL_SPEED_MULT	1.0
# define ENEMY_TRACK_SPEED_MULT		(ENEMY_PATROL_SPEED_MULT * ENEMY_TRACK_BOOST)
// RSPのNPC共通の速度係数（追跡・逃走・徘徊すべてに掛かる）。基準 enemy_speed が
// プレイヤーの move_speed より速いため、RSPでは全体を遅くしてプレイヤーが追える/
// 逃げられるようにする。0.3 で既定の追跡速度がプレイヤーの歩行をわずかに下回る
# define RSP_ENEMY_SPEED_MULT		0.3
# define ENEMY_PATROL_ARRIVE		0.2
// 徘徊中に曲がり角で向きを変える旋回速度[度/秒]。向きが揃うまで前進を止める
// （0.5秒で45度・1秒で90度）。旋回中も視野(dir_angle)は連動して動く
# define ENEMY_TURN_DEG_PER_SEC		90.0

/* ************************************************************************** */
// フォーマット上の不変条件（仕様で固定。チューニング対象ではない）
# define BYTES_PER_PIXEL		4

/* ************************************************************************** */
// フラッシュライト：正面コーンの半角[度]・届く距離[マス]・暗化の打消し量(1.0で全打消)
# define LIGHT_CONE_DEG		20.0
# define LIGHT_RANGE		50.0
# define LIGHT_BOOST		1.5

/* ************************************************************************** */
// 装飾スプライト(通行可オブジェクト)のスポットライト：影響半径[マス]と
// 乗算による明るさの底上げ量(中心の最大ゲインは 1.0 + SPOT_GAIN 倍)
# define SPOT_RADIUS		4.0
# define SPOT_GAIN			4.0

/* ************************************************************************** */
// 手持ち（FPSの銃/ライト、RSPの手）を画面下部へ小さく描画する表示倍率
// （画面高に対する比率）。FPS・RSP 両モードで共有する
# define WEAPON_SCALE_SMALL	0.4

#endif
