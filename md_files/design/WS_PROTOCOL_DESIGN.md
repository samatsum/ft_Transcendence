# WS_PROTOCOL_DESIGN — WSプロトコル / GameRoom・マッチメイキング詳細設計書（②）

**位置づけ**: [ARCHITECTURE_DESIGN.md](./ARCHITECTURE_DESIGN.md) §2.3・§3.1 の詳細化。[ENGINE_SEPARATION_DESIGN.md](./ENGINE_SEPARATION_DESIGN.md) §3-B（sim 公開 API）・§3-D（スナップショット構造）と整合する。弐（Backend/DevOps）の Day 4〜9 の作業指示書に相当し、参（Frontend）のクライアント実装契約・肆（Gameplay）のマッチメイキング仕様の正本を兼ねる。
**原則**: 本書は実装コードを含まない（ワイヤフォーマット・状態機械・受入条件のみ）。メッセージスキーマの実装正本は `shared/` の zod 定義とし、本書と乖離した場合は本書を改訂してから実装する。

---

## 0. 前提と今回確定した決定

確定済み決定（再検討しない）: サーバ権威 + JSON スナップショット（シム30Hz / 配信15–20Hz / 補間100ms / 予測は視点回転のみ）、WS 5系統 `join / input / snapshot / event / spectate`、切断席は AI 代替→復帰で人間に戻す、マッチメイキングキューは両ゲーム共通基盤、`@fastify/websocket` + nginx WSS 終端。

本書作成にあたり新たに確定した決定（チーム合意 2026-07-08）:

| # | 論点 | 決定 |
|---|---|---|
| D-1 | マッチメイキング方式 | **クイックマッチ（FIFO・既定ルール）+ カスタムルーム（ルームコード招待制・ホストが #11 カスタマイズを設定）** の2本立て |
| D-2 | 定員未達時の開始 | **手動+タイムアウト併用**: キューリーダーに「AIを埋めて今すぐ開始」ボタン + 60秒で自動 AI 埋め開始 |
| D-3 | 再接続猶予 | **30秒**（RSP: AI代替→復帰で人間に戻す / FPS: 30秒経過で不戦勝。同一値） |

---

## 1. 接続トポロジ（WS エンドポイント設計）

| 案 | 概要 | 長所 | 短所 | 判定 |
|---|---|---|---|---|
| **2エンドポイント分離（採用）** | `/ws/lobby`（ログイン後常時接続）と `/ws/game/:roomId`（試合中のみ） | 接続のライフサイクルが用途と一致（ゲームWSはルームと共に消える）。ルーティング・認可・レート制限を用途別に単純化。ロビー常時接続が presence（オンライン状態）の根拠そのものになる | ブラウザのWS接続が最大2本 | ◎ |
| 単一WS多重化 | 1本のWSに channel フィールドで多重化 | 接続1本 | ルーム参加状態の管理がアプリ層に漏れ、切断時の状態掃除が複雑化。ゲームWSの輻輳がロビー通知を巻き込む | × |

- **認証**: WS アップグレード時に httpOnly セッション Cookie を検証（same-origin なのでブラウザが自動送付。nginx は Cookie ヘッダをそのままプロキシ）。**トークンを URL クエリに載せることは禁止**（アクセスログ漏洩対策）。未認証は close `4000`。
- **Origin 検査**: アップグレード時に `Origin` ヘッダが自ホストと一致しない接続を拒否（CSRF-over-WS 対策）。
- **ハートビート**: サーバが 10 秒間隔で WS ping を送出（ブラウザは自動 pong）。**2回連続無応答（20秒）で切断扱い**とし、ゲームWSでは §7 の切断フローを開始する。アプリ層の keepalive メッセージは設けない（プロトコル標準機能で足りる）。
- **同一ユーザーの多重接続**: 同一ユーザーが同じエンドポイントに新規接続した場合、**旧接続を close `4004`（replaced）で置換**する（リロード・タブ複製で自然に最新が勝つ）。

---

## 2. 共通メッセージ規約

### 2-A. エンベロープ

全メッセージは JSON テキストフレーム1つ = 1メッセージ。

```
{ "t": "<メッセージ種別>", "d": { ...ペイロード } }
```

- `t` は snake_case。`d` は種別ごとに zod スキーマを `shared/ws/` に定義し FE/BE で共有（入力検証要件の充足箇所）。
- プロトコルバージョン: サーバ→クライアントの初回メッセージ（`lobby_hello` / `welcome`）に `v: 1` を含める。クライアントは不一致時に再読込を促す（評価期間中は常に 1。将来互換のための予約）。
- クライアント→サーバの1メッセージ上限 **4KB**（超過は close `4001`）。未知の `t`・スキーマ違反は `error` 応答（§2-C）とし、**切断はしない**（開発中の前方互換のため）。ただし連続10回で close `4001`。

### 2-B. WS クローズコード規約

| code | 意味 | 発生箇所 |
|---|---|---|
| 1000 | 正常終了（画面遷移・試合終了後の退室） | 双方 |
| 4000 | 未認証 / セッション失効 | アップグレード時 |
| 4001 | プロトコル違反（スキーマ違反の累積・サイズ超過） | サーバ |
| 4002 | ルームが存在しない / 既に閉鎖 | ゲームWS join 時 |
| 4003 | 参加権なし（満席・participant でない） | ゲームWS |
| 4004 | 新しい接続に置換された | サーバ |
| 4005 | レート制限超過 | サーバ |

### 2-C. エラーメッセージ（インライン）

`{ t: "error", d: { code: string, msg: string, ref?: string } }`。`code` は機械可読（例 `queue_already_joined` / `room_full` / `invalid_rules`）、`ref` は原因となったクライアントメッセージの `t`。エラー一覧は `shared/ws/errors.ts` に列挙し本書の各節に個別記載。

### 2-D. レート制限（サーバ側・接続単位）

| 対象 | 上限 | 超過時 |
|---|---|---|
| ゲームWS `input` | 40 msg/s（30Hz 送信 + ジッタ余裕） | 超過分を黙って破棄（切断しない） |
| ロビーWS 全種 | 5 msg/s | `error(rate_limited)`、連続超過で close `4005` |
| `room_create` | 3 回/分/ユーザー | `error(rate_limited)` |

---

## 3. ロビー WS 仕様（`/ws/lobby`）

ログイン成功後に SPA が常時1本張る。用途は (1) presence、(2) マッチメイキング、(3) カスタムルーム、(4) 試合結果のライブ反映（モジュール #5「接続/切断処理・ブロードキャスト」の主たる証拠部分）。

### 3-A. サーバ→クライアント

| t | d | 契機 |
|---|---|---|
| `lobby_hello` | `v`, `online_count`, `self:{status}` | 接続直後 |
| `presence_update` | `user_id`, `status: online\|in_queue\|in_game\|offline` | フレンドの状態変化時（**フレンドにのみ**配信。全体ブロードキャストしない） |
| `queue_state` | `mode`, `position`, `waiting`, `auto_fill_in_ms`, `is_leader` | キュー変化時 + 1秒周期（残り時間表示用） |
| `match_found` | `room_id`, `mode`, `slot` | マッチ成立時（§4-D） |
| `room_state` | `code`, `mode`, `host_id`, `rules`, `seats[]:{slot, user_id?, display_name?, is_ai}` | ルーム状態の全量スナップショット（変化のたびに全量再送。差分管理しない） |
| `match_result` | `match_id`, `mode`, `winner`, `players[]` | 任意の試合終了時に**ロビー全体へ**配信（「リアルタイム更新が全接続ユーザーに反映される」要件のデモ箇所） |
| `error` | §2-C | — |

### 3-B. クライアント→サーバ

| t | d | 検証・エラー |
|---|---|---|
| `queue_join` | `mode: rsp\|fps` | in_game / 他キュー参加中 / ルーム所属中は `queue_already_joined` 等で拒否（**1ユーザー1コンテキスト原則**） |
| `queue_leave` | — | 非参加なら no-op |
| `queue_fill_start` | — | キューリーダー（最古参加者）のみ受理。他は `not_leader`（D-2 の手動ボタン） |
| `room_create` | `mode`, `rules`（§4-B） | rules は zod で範囲検証。違反は `invalid_rules` |
| `room_join` | `code` | 不存在 `room_not_found` / 満席 `room_full` |
| `room_leave` | — | ホスト退室は §4-C |
| `room_update_rules` | `rules` | ホストのみ。開始後は不可 |
| `room_start` | — | ホストのみ。空席は AI で埋めて開始 |

presence の初期一覧（フレンド一覧+状態）は REST で取得し、以後の差分のみ本 WS で受ける（③で API 定義）。

---

## 4. マッチメイキング詳細仕様

### 4-A. クイックマッチ（FIFO キュー）

- キューは**モード別に2本**（RSP / FPS）。データはメモリ内 FIFO（順序=参加時刻）。サーバ再起動でキューは消えてよい（試合中データと違い永続化しない）。
- 成立人数: RSP=4 / FPS=2。**成立判定は参加・離脱・タイムアウトのイベント時のみ**（ポーリングしない）。
- スロット割当: キュー先頭から `slot 0,1,2,3` を付与。**RSP のチームは slot 0,1=チームA / slot 2,3=チームB**（偶奇ではなく連番。フレンドと連続参加すると同チームになりやすい、を意図した仕様とする）。FPS は slot 0,1。
- **D-2 の定員未達開始**: キュー先頭（リーダー）の画面に「AIを埋めて今すぐ開始」を常時表示（`queue_state.is_leader`）。加えて**キューに1人以上が60秒滞在した時点で自動発火**（`auto_fill_in_ms` が 0 到達）。どちらの場合も不足席を `is_ai: true` で埋めて成立させる。
- 切断（ロビーWS断）はキューから即時離脱。再入は明示的な `queue_join` のみ。

### 4-B. カスタムルーム（D-1）

- `room_create` でルームコード発行: **6文字 A–Z 0–9（紛らわしい I/O/0/1 を除く32文字集合）**。有効期間はルーム存続中のみ。
- ホスト権限: `rules` 変更・`room_start`・（暗黙に）解散。ホストが退室したら**最古参加者へホスト委譲**、全員退室で即解散。
- ルール（#11 カスタマイズの実体。`Match.settingsJson` にそのまま保存され、`game_create` の `match_rules` になる）:

| フィールド | 型・範囲 | 既定 | 対象 |
|---|---|---|---|
| `map` | サーバ提供マップ一覧のID（`GET /api/maps` ③で定義） | モード既定マップ | 両方 |
| `target_score` | int 3–21 | 10 | RSP のみ（G-05 の `match_rules.target_score`） |
| `move_speed_mult` | 0.5–2.0（0.1刻み） | 1.0 | 両方（既存 MS 系パラメータの UI 化） |
| `enemy_speed_mult` | 0.5–2.0（0.1刻み） | 1.0 | FPS のみ（ハザード難度） |
| `ai_level` | `easy\|normal\|hard`（#9 の速度/反応係数プリセット） | normal | 両方（AI 席がある場合） |

- クイックマッチは常に既定ルール（`rules` 省略時値）。これにより「キュー参加者間のルール合意」問題を排除する（D-1 の設計意図）。
- 席: モード定員分の `seats[]`。人間が埋めない席は開始時に AI 化。**最低1人の人間（ホスト）がいれば開始可**（全AI試合は作れない）。

### 4-C. 成立からゲーム開始まで（両方式共通）

```
[成立] キュー成立 or room_start
   │  GameRoom 生成（§6）: game_create → 人間席/AI席を game_add_combatant
   ▼
[match_found 配信] ロビーWS で各人間参加者へ { room_id, mode, slot }
   │  SPA は /game/<room_id> へ遷移し ゲームWS を張り join 送信
   ▼
[接続待ち: 最大10秒] 全人間席の join 完了 or 10秒経過
   │  未接続席は AI に差し替えて続行（キャンセルしない）
   │  ※人間が1人も接続しなかった場合のみルーム破棄（試合記録なし）
   ▼
[countdown] event(countdown, 3秒) → event(match_start) → match.state=playing
```

- 接続待ちの10秒は D-3 の再接続猶予（30秒）とは別物（開始前は短く、開始後は長く）。
- マッチ成立後のキャンセル UI は設けない（LoL 型 accept ダイアログは実装しない。評価デモのテンポを優先し、遷移は自動）。

### 4-D. マッチメイキング状態機械（ユーザー視点）

```
idle ──queue_join──► queued ──成立──► matched ──join完了──► playing
  ▲                    │                 │(10s未接続)          │
  └──queue_leave/切断──┘                 └──► AI代替で開始      └─► finished → idle
idle ──room_create/room_join──► in_room ──room_start──► matched（以降同上）
```

スコープ外（実装しない）: パーティ同時キュー、レート/ランク考慮マッチング、トーナメント、observer のキュー。観戦は §5-E のフックのみ。

---

## 5. ゲーム WS 仕様（`/ws/game/:roomId`）

ARCHITECTURE §2.3 の 5 系統 `join / input / snapshot / event / spectate` を正式化したもの。

### 5-A. クライアント→サーバ

| t | d | 備考 |
|---|---|---|
| `join` | —（Cookie とルームの participant 登録で本人特定。ペイロード不要） | 初回参加も再接続も同一メッセージ。非 participant は §5-E の観戦条件を満たさない限り close `4003` |
| `input` | `seq`, `yaw`, `mv`, `act?`（下表） | 30Hz 固定送信 |
| `leave` | — | 明示的な投了/退室（切断猶予を待たず即 AI 化・FPS は即不戦勝） |
| `spectate` | — | 観戦参加（保1。§5-E） |

**input フィールド仕様**（sim 層 `t_input` への写像。論理軸は既存 `t_axis` 準拠）:

| フィールド | 型 | 内容 |
|---|---|---|
| `seq` | uint32 単調増加 | 順序逆転・重複の破棄用。サーバは「最後に受理した seq」より小さいものを黙って破棄 |
| `yaw` | float | **絶対値・ラジアン**。視点回転はクライアント即時適用（確定済みの唯一の予測）のため、クライアント申告値をサーバが採用。サーバ側検証は [-π,π) 正規化と有限値チェックのみ（回転チートは許容リスクと明記: 照準優位が発生しないゲームルールであり、LAN 評価では費用対効果がない） |
| `mv` | uint4 ビットマスク | bit0=前進 / bit1=後退 / bit2=左ストレイフ / bit3=右ストレイフ（回転キーは含めない。回転は `yaw` に一本化し、クライアントのキー→yaw 積分は render 側の既存ロジックを使う） |
| `act` | uint4 ビットマスク（省略可） | 既存エンジンの武器/射撃状態との互換予約。本プロジェクトの両モードでは 0 固定 |

> **改訂（2026-07-11）**: 当初あった `hand`（RSP の選択手）フィールドは**削除**した（⑤ [BACKLOG.md](./BACKLOG.md) D-17）。手はリスポーン・自陣踏み込みで**サーバ権威**が変える状態であり、現行ルールにプレイヤーが手を選ぶ概念は存在しない。入力面に出すとチートと不整合の入口になるだけである。

- **送信規約**: クライアントは表示フレームから **30Hz に間引いて全量状態を送る**（イベント駆動ではなく状態駆動）。パケットロスト相当（WS 断以外では起きない）でも次のメッセージが全量なので自己回復する。サーバは席ごとに最新 `input` を保持し、**毎 tick で `game_set_input` に適用**する（§3-B）。
- 入力は playing 状態でのみ受理（waiting/countdown/finished 中は黙って破棄）。

### 5-B. サーバ→クライアント

| t | d | 契機 |
|---|---|---|
| `welcome` | `v`, `role: player\|spectator`, `slot`, `combatant_id`, `mode`, `rules`, `map_text`, `tick_rate: 30`, `snap_rate: 15`, `interp_ms: 100`, `resume: bool` | join/spectate 受理直後 |
| `snapshot` | §5-C | 15Hz（2 tick に1回）。全参加者+観戦者に**同一シリアライズ済み文字列**を配信（クライアント別加工なし） |
| `event` | §5-D | 発生時 |
| `player_status` | `slot`, `state: connected\|ai\|grace`（grace=切断猶予中） | 席の人間/AI 切替時 |
| `error` | §2-C | — |

**マップ配布の決定**: `welcome.map_text` に**サーバがロード済みの `.cub` テキストを同梱**する。

| 案 | 長所 | 短所 | 判定 |
|---|---|---|---|
| **welcome に .cub テキスト同梱（採用）** | サーバとクライアントのマップ不一致が原理的に起きない（単一情報源）。カスタムマップ追加時も配信経路の追加作業ゼロ | welcome が数KB 太る（1回きりなので無害） | ◎ |
| 静的アセットを fetch | welcome が軽い | アセットとサーバロード内容の乖離リスク。バージョン管理が増える | × |

クライアントは `map_text` を render 側の `game_create`（表示用）に渡す（§3-B の「.cub のメモリ上テキスト」引数と同一経路。native/web/サーバの三者が同じパーサを通る）。テクスチャは従来どおり静的アセット（E-06 の `.tex`）。

### 5-C. snapshot ペイロード（§3-D と 1:1 対応）

```
{ "t":"snapshot", "d":{
  "tick": 12345,
  "match": { "state":"waiting|playing|finished", "winner": null|0|1|combatant_id,
             "score":[7,4] },
  "combatants":[
    { "id":0, "team":0, "hand":0|1|2, "pos":[12.5,4.25], "dir":1.57,
      "alive":true, "is_ai":false, "respawn_ms":0 } ],
  "world_delta": { "collected":[[3,4],[7,2]], "doors_open":true }  // 変化時のみ・FPSのみ
} }
```

| フィールド | §3-D 対応 | 補足 |
|---|---|---|
| `tick` | tick | サーバ tick 番号（30Hz カウント。配信は偶数 tick） |
| `match.state` | match の状態 | sim の enum そのまま（waiting/playing/finished）。カウントダウンは**ルーム層の event で表現し sim の enum を拡張しない**（§3-D 改変を避ける） |
| `match.winner` | 勝者 | RSP=チーム番号 / FPS=combatant_id / 未決着=null |
| `match.score` | スコア | RSP=チーム別 `[A,B]` / FPS=`[0,0]` 固定（勝敗はゴール到達のみ） |
| `combatants[]` | id/team/hand/pos(x,y)/dir_angle/alive/is_ai/respawn_timer | FPS の敵ハザードも同形式で含む（クライアントは区別せず描画）。`respawn_ms` はミリ秒残量 |
| `world_delta` | 収集済みアイテム座標・扉開放フラグ | **含まれる時のみ処理**（差分。初回 join/再接続時は welcome 直後の最初の snapshot に全量を必ず含める） |

- サイズ予算: 4人+敵数体で **1KB 未満/回** を維持（§3-D）。フィールド追加時はこの予算を受入条件として検査する。
- **補間契約（クライアント責務）**: スナップショットをバッファし、`now - 100ms` の時点を挟む2つで線形補間（角度は最短弧）。自分の `yaw` のみローカル値を優先（視点回転の即時適用）。補間結果を `game_apply_snapshot` で表示用 `t_game` に書き `render_frame` を呼ぶ（§3-B の分担どおり。**クライアントに勝敗判定コードは存在しない**）。

### 5-D. event 種別

ARCHITECTURE §2.3 の 4 種を核に、ルーム層イベントを追加した閉じた列挙とする。

| kind | d | 発生 |
|---|---|---|
| `countdown` | `seconds: 3` | 接続待ち完了時 |
| `match_start` | — | countdown 満了（この時点で state=playing） |
| `point_scored` | `team`, `score:[a,b]`, `by_id` | RSP 得点時（演出・効果音トリガ。値の正本は snapshot 側） |
| `hand_changed` | `id`, `hand` | 手の変更時（同上） |
| `goal` | `id` | FPS ゴール到達 |
| `match_end` | `winner`, `reason: score\|goal\|forfeit\|abandon`, `match_id` | 決着。`match_id` は永続化済み DB 行（結果画面が REST で詳細取得） |
| `player_disconnected` | `slot`, `grace_ms: 30000` | 切断検知（→ player_status: grace） |
| `player_reconnected` | `slot` | 猶予内復帰（→ player_status: connected） |
| `ai_takeover` | `slot` | 猶予満了 or `leave` による AI 化（→ player_status: ai） |

イベントは**演出・通知のトリガ**であり、ゲーム状態の正本は常に snapshot（イベントを取りこぼしても状態は snapshot で追いつく設計。再接続時にイベント再送はしない）。

### 5-E. 観戦フック（保1。実装は余力時のみ、設計コストのみ先払い）

- `spectate` を受けた接続は **snapshot/event の配信集合に追加されるだけ**（`welcome.role=spectator`, `slot=null`）。`input` は黙って破棄。
- 視点切替はクライアント内で完結（snapshot は全戦闘員の pos/dir を含むため、任意の戦闘員視点で `render_frame` 可能）。サーバ追加コストゼロ。
- 参加資格: playing 中の任意ログインユーザー。ルーム一覧 API（③）は保1着手時に追加。

---

## 6. GameRoom 状態機械とライフサイクル

**1試合 = 1ルーム = 1つの `sim.wasm` インスタンス**（確定済み）。ルームはモジュールスコープの Map（`room_id → GameRoom`）で同時複数保持（マルチユーザー要件の根拠）。

### 6-A. 状態機械

```
created ──全人間join or 10s──► countdown(3s) ──► playing ──決着──► finished ──60s──► closed
   │                                               │(全人間席がgrace満了/abandon)
   └── 人間0人のまま10s ──► closed（記録なし）        └──► finished(abandon)
```

| 状態 | tick 駆動 | input 受理 | 摘要 |
|---|---|---|---|
| created | しない | しない | `game_create` + 全席 `game_add_combatant` 済み。接続待ち |
| countdown | しない | しない | `event(countdown)` → 3秒後 `event(match_start)` |
| playing | **30Hz `setInterval`** で `game_step(game, 1/30)`、偶数 tick で `game_snapshot` → JSON → 一斉配信 | する | 唯一の正 |
| finished | しない（最終 snapshot は配信済み） | しない | 永続化（§6-C）→ 結果画面用に 60 秒接続維持 → close 1000 |
| closed | — | — | `game_destroy`、Map から除去 |

### 6-B. sim API（§3-B）との対応表

| ルームのイベント | 呼び出す sim API | 備考 |
|---|---|---|
| ルーム生成 | `game_create(cub_text, mode, match_rules)` | `match_rules` = §4-B の rules（サーバがマップIDから cub_text を解決） |
| 席の確定 | `game_add_combatant(game, slot, is_ai)` × 定員 | 人間未接続席も**先に AI で生成**し、join 時に入力源を EXTERNAL へ切替（下記追補） |
| `input` 受信 | 席バッファに保持 → 毎 tick `game_set_input(game, combatant_id, t_input)` | `mv`/`yaw`/`hand` → `t_input` への写像は platform/headless 層の責務 |
| tick | `game_step(game, dt=1/30)` | 戻り値（進行中/決着）で finished 遷移を判定 |
| 配信 | `game_snapshot(game, buf)` → JS で JSON 化 | シリアライズは Node 側。wasm 内で文字列化しない |
| 破棄 | `game_destroy(game)` | closed 遷移時 |

> **§3-B への追補要求（本書からの唯一のエンジンAPI追加）**: 切断時 AI 代替⇔復帰は §3-C で「入力源の付け替えで済む」設計だが、§3-B の公開 API 表に該当関数がない。**`game_set_input_source(game, combatant_id, AI|EXTERNAL)` を公開 API に追加すること**。E-10（sim 公開 API）と G-02（入力源抽象）の受入条件に本関数を含める（⑤のバックログで反映）。

### 6-C. 試合終了時の永続化と結果配信

1. 最終 snapshot（`match.state=finished`）配信 → `event(match_end)` 配信。
2. Prisma で `Match` + `MatchPlayer` を書き込み（**AI 席も行として残す**。§3.3 準拠）。`result` の帰属規約:

| ケース | 記録 |
|---|---|
| 通常決着（score/goal） | 勝者側 win / 敗者側 lose |
| FPS 不戦勝（forfeit） | 残留側 win(reason=forfeit) / 離脱側 **abandon** |
| RSP 途中離脱して未復帰のまま決着 | 本人は**チーム結果に関わらず abandon**。復帰済みなら通常判定 |
| 全人間離脱で打ち切り | `winnerTeam=null`、全離脱者 abandon（AI 席は draw 扱いで統計から除外） |

3. ロビー WS へ `match_result` をブロードキャスト（§3-A。「試合結果のライブ反映」のデモ箇所）。
4. 60 秒後 close 1000 → `game_destroy`。結果画面の詳細（履歴・統計への反映）は REST（③）で取得。

---

## 7. 切断・再接続・AI 代替（Remote players モジュールの中核デモ）

### 7-A. フロー（RSP の例）

```
[切断検知] ゲームWS close / ping 2回無応答
   │ player_status(slot, grace) + event(player_disconnected, grace_ms=30000)
   │ 席は即座に AI が入力生成を代行 … game_set_input_source(id, AI)
   ▼
[猶予 30秒以内に再接続]                  [猶予満了]
   │ 同一ユーザーが /ws/game/:roomId       │ event(ai_takeover)
   │ に接続し join                        │ 以降この席は試合終了まで AI
   │ → userId と席の対応で本人確認          │ （本人が来ても観戦のみ可）
   │ → welcome(resume=true) + 直後の
   │   snapshot に world_delta 全量
   │ → game_set_input_source(id, EXTERNAL)
   │ → event(player_reconnected)
   ▼
[復帰完了] 人間入力に戻る
```

- **本人確認はセッション Cookie のみ**で行う（専用の再接続トークンは発行しない。ARCHITECTURE §2.3 の「セッショントークン」はログインセッションを指すと解釈し、二重のトークン系を作らない）。セッション失効時はログイン画面へ→再ログイン後も猶予内なら復帰可。
- FPS 1vs1: 猶予中も試合は続行（AI が代走）。**猶予満了で不戦勝**（`match_end(reason=forfeit)`）。両者切断は先に満了した側が abandon。
- `leave`（明示退室）は猶予なしで即 `ai_takeover`（FPS は即 forfeit）。
- RSP で全人間席が grace/ai になった場合: **30秒の猶予窓のうちは AI のみで継続**（誰かの復帰を待つ）。全席の猶予が切れたら abandon で打ち切り（§6-C）。

### 7-B. 評価デモ台本フック

タブを閉じる→別タブでログイン→`/game/:roomId` へ再入→復帰、が 30 秒で完結すること（D-3 の選定理由）。`player_status` により他プレイヤーの画面に「切断中(AI)」表示が出ることを HUD 仕様（④）に引き継ぐ。

---

## 8. 異常系・セキュリティ・性能予算

| 項目 | 仕様 |
|---|---|
| 入力検証 | 全メッセージを zod（shared 共有）+ サーバ側意味検証（yaw 有限値・範囲、seq 単調、rules 範囲）。二重検証が「FE/BE 双方での検証」要件の WS 側の証拠 |
| バックプレッシャ | 接続ごとの送信バッファが 64KB を超えたら snapshot の送信をその接続のみスキップ（event は落とさない）。1MB 超で close 4005（回線死判定） |
| tick 過負荷 | `game_step` 所要が周期の 50% を超えた場合に警告ログ（監視保4のメトリクス候補）。ルーム数上限は設けない（4人×数ルームの評価規模では不要。負荷試験 Day 12 で確認） |
| 時刻 | クライアントとの時計同期はしない。補間は「受信時刻ベースの相対時間」で行う（snapshot 到着間隔から描画時刻を導出。NTP 的機構は YAGNI） |
| ログ | 接続/切断/join/match 成立/永続化を構造化ログ（pino）。input はログしない（量とプライバシー） |
| 帯域見積 | 下り: ~500B × 15Hz ≈ 7.5KB/s/クライアント。上り: ~60B × 30Hz ≈ 1.8KB/s。8窓同時デモでも合計 100KB/s 未満 |

---

## 9. 整合性チェックリスト（正本との突合）

| 正本の決定 | 本書での担保箇所 |
|---|---|
| WS 5系統 join/input/snapshot/event/spectate | §5-A/5-B（名称そのまま採用。ロビー系は別エンドポイントのため 5 系統の外） |
| input(seq, keys, yaw) | §5-A `input{seq, mv, yaw, act}`（keys→mv+act に具体化。`hand` は ⑤ D-17 で削除 — 手はサーバ権威の状態のため） |
| snapshot(tick, combatants[], score) / §3-D 全フィールド | §5-C 対応表（tick/match/combatants/world_delta 完全一致） |
| event(point_scored, hand_changed, goal, match_end) | §5-D（4種を核に室内イベントを追加） |
| シム30Hz / 配信15–20Hz / 補間100ms | §6-A（30Hz tick・偶数 tick 配信=15Hz）/ §5-C 補間契約（100ms） |
| 予測は視点回転のみ | §5-A yaw クライアント権威 + §5-C「自分の yaw のみローカル優先」 |
| 切断席 AI 代替→復帰 / FPS 不戦勝 | §7（D-3: 30秒）+ §6-B 追補 API |
| 1試合=1ルーム=1 sim.wasm・同時複数 | §6 冒頭 |
| 観戦=読み取り専用購読・追加コストほぼゼロ | §5-E |
| AI 席=入力供給者の違いのみ | §6-B（先に AI で生成→EXTERNAL へ切替） |
| マッチメイキングは両ゲーム共通基盤 | §4-A（モード別キュー2本を同一機構で） |
| JSON 開始・バイナリ化は YAGNI | §2-A + §5-C サイズ予算（1KB 未満/回を受入条件化） |
| game_create/add_combatant/set_input/step/snapshot/apply_snapshot/destroy | §6-B 対応表（唯一の追補 = `game_set_input_source`） |

## 10. 受入条件（⑤バックログ W-xx/B-xx の種）

1. 2ブラウザ+AI 2席で RSP クイックマッチが成立し、先取点到達→`match_end`→DB 行→ロビーの `match_result` 受信まで通しで動く。
2. 「AIを埋めて今すぐ開始」ボタンと 60 秒自動開始の両経路で試合が成立する。
3. カスタムルーム: コード招待で入室→ホストが `target_score=3` に変更→開始→3点で決着する。
4. 試合中にタブを閉じ、30 秒以内の再入で人間に復帰する（他画面に grace/ai/connected の遷移が表示される）。FPS では 30 秒放置で不戦勝が記録される。
5. snapshot が 1KB 未満/回であることを負荷テストで実測。8 ブラウザ同時（2 ルーム+観戦フック）でコンソールエラーなし。
6. 不正メッセージ（スキーマ違反・巨大ペイロード・seq 逆行・範囲外 rules）がすべて仕様どおりのエラー/破棄になる。

---

## 改訂記録

| 日付 | 内容 |
|---|---|
| 2026-07-11 | §5-A・§9: `input.hand` を削除（⑤ [BACKLOG.md](./BACKLOG.md) D-17。選択肢比較は ⑤ §0） |
