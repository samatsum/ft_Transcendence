# WS_PROTOCOL_DESIGN — WSプロトコル / GameRoom・マッチメイキング詳細設計書（②）

**位置づけ**: [ARCHITECTURE_DESIGN.md](./0-全体アーキテクチャ設計.md) §2.3・§3.1 の詳細化。
[ENGINE_SEPARATION_DESIGN.md](./1-エンジン分離設計.md) §3-B（sim 公開 API）・§3-D（スナップショット構造）と整合する。
Backend/DevOps レーンのうち **samatsum**（WS / GameRoom / マッチメイキング W-09）の作業指示書であり正本。
**hminemur**（GameView）はクライアント実装契約の消費者として本書を参照する。
**原則**: 本書は実装コードを含まない（ワイヤフォーマット・状態機械・受入条件のみ）。
メッセージスキーマの実装正本は `shared/` の zod 定義とし、本書と乖離した場合は本書を改訂してから実装する。

---

## 0. 前提と今回確定した決定

確定済み決定（再検討しない）: サーバ権威 + JSON スナップショット（シム30Hz / 配信15–20Hz / 補間100ms / 予測は視点回転のみ）、
WS 5系統 `join / input / snapshot / event / spectate`、切断席は AI 代替→復帰で人間に戻す、
マッチメイキングキューは両ゲーム共通基盤、`@fastify/websocket` + nginx WSS 終端。

本書作成にあたり新たに確定した決定（チーム合意 2026-07-08）:

| # | 論点 | 決定 |
|---|---|---|
| D-1 | マッチメイキング方式 | **クイックマッチ（FIFO・既定ルール）+ カスタムルーム（ルームコード招待制・ホストが #11 カスタマイズを設定）** の2本立て |
| D-2 | 定員未達時の開始 | **手動+タイムアウト併用**: キューリーダーに「AIを埋めて今すぐ開始」ボタン + 60秒で自動 AI 埋め開始 |
| D-3 | 再接続猶予 | **30秒**（RSP: AI代替→復帰で人間に戻す / FPS: 30秒経過で不戦勝。同一値） |

### 0-A. W-01 以降の実装から W-08 が継承する設計原則（2026-07-30 確定）

W-08 は新しい方式を持ち込まず、samatsum が W-01 / W-10 / W-11 / W-14 で実装・検証した
境界をそのままロビーへ横展開する。具体的には次の5点を固定する。

| 既存実装 | W-08 が継承する原則 |
|---|---|
| W-01 `app/{backend,frontend,shared}` | ワイヤ契約は `app/shared/src/ws/lobby.ts` の zod を単一情報源にし、BE/FE の独自型を作らない。ブラウザは REST/WS とも同一オリジンへ接続する |
| W-10 `room.ts` / `rooms.ts` | 状態機械は WS を知らない純粋な層に置く。時刻・乱数・外部処理を注入可能にして決定的に検査する。非同期生成の重複は `reserved` / 状態予約で防ぐ |
| W-11 `game/ws.ts` | WebSocket を知るのは gateway 層だけ。認証完了前の受信を上限付きで保持し、形は zod、意味・権限・現在状態はコードで検証する。同一ユーザー置換では旧接続の close を無害化する |
| W-14 `maps.ts` / `createRoomFromRules` | クライアントのマップ ID は静的ホワイトリストで解決し、パスを受け取らない。ロビーは確定済み rules を W-09 へ渡し、GameRoom は `.cub` テキストだけを知る |
| W-10/W-11 の受入検査 | 実時間の通し検査と、fake clock を使う決定的検査を分ける。「0件を検査して合格」を禁止し、競合時に処理が**ちょうど1回**であることを件数で確認する |

この継承により、ロビー実装の配置は `app/backend/src/lobby/`、ゲーム実行は既存
`app/backend/src/game/`、共有契約は `app/shared/src/ws/` とし、LobbyRoom と GameRoom を
同じ `Room` 型へ統合しない。前者は招待・席・rules を管理する待合室、後者は1試合1
`sim.wasm` の実行単位で、ライフサイクルが異なるためである。

---

## 1. 接続トポロジ（WS エンドポイント設計）

| 案 | 概要 | 長所 | 短所 | 判定 |
|---|---|---|---|---|
| **2エンドポイント分離（採用）** | `/ws/lobby`（ログイン後常時接続）と `/ws/game/:roomId`（試合中のみ） | 接続のライフサイクルが用途と一致（ゲームWSはルームと共に消える）。ルーティング・認可・レート制限を用途別に単純化。ロビー常時接続が presence（オンライン状態）の根拠そのものになる | ブラウザのWS接続が最大2本 | ◎ |
| 単一WS多重化 | 1本のWSに channel フィールドで多重化 | 接続1本 | ルーム参加状態の管理がアプリ層に漏れ、切断時の状態掃除が複雑化。ゲームWSの輻輳がロビー通知を巻き込む | × |

- **認証**: WS アップグレード時に httpOnly セッション Cookie を検証（same-origin なのでブラウザが自動送付。
  nginx は Cookie ヘッダをそのままプロキシ）。**トークンを URL クエリに載せることは禁止**（アクセスログ漏洩対策）。
  未認証は close `4000`。
- **Origin 検査**: アップグレード時に `Origin` ヘッダが自ホストと一致しない接続を拒否（CSRF-over-WS 対策）。
  **close コードは `4003`（参加権なし）**（2026-07-27 追補。この拒否だけコードが未割当だった。
  `4000` は「未認証 / セッション失効」＝ Cookie の問題を指すので、Origin 不一致とは区別する）。
- **ハートビート**: サーバが 10 秒間隔で WS ping を送出（ブラウザは自動 pong）。
  **2回連続無応答（20秒）で切断扱い**とし、ゲームWSでは §7 の切断フローを開始する。
  アプリ層の keepalive メッセージは設けない（プロトコル標準機能で足りる）。
- **同一ユーザーの多重接続**: 同一ユーザーが同じエンドポイントに新規接続した場合、
  **旧接続を close `4004`（replaced）で置換**する（リロード・タブ複製で自然に最新が勝つ）。

---

## 2. 共通メッセージ規約

### 2-A. エンベロープ

全メッセージは JSON テキストフレーム1つ = 1メッセージ。

```
{ "t": "<メッセージ種別>", "d": { ...ペイロード } }
```

- `t` は snake_case。`d` は種別ごとに zod スキーマを `shared/ws/` に定義し FE/BE で共有（入力検証要件の充足箇所）。
- プロトコルバージョン: サーバ→クライアントの初回メッセージ（`lobby_hello` / `welcome`）に `v: 1` を含める。
  クライアントは不一致時に再読込を促す（評価期間中は常に 1。将来互換のための予約）。
- クライアント→サーバの1メッセージ上限 **4KB**（超過は close `4001`）。
  未知の `t`・スキーマ違反は `error` 応答（§2-C）とし、**切断はしない**（開発中の前方互換のため）。
  ただし連続10回で close `4001`。
  **「連続」の定義（2026-07-27 追補）**: カウンタは**検証を通ったメッセージで 0 に戻す**。
  接続の生涯累計にすると、長時間つないでいる正常なクライアントがいずれ誤爆する。

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

`{ t: "error", d: { code: string, msg: string, ref?: string } }`。
`code` は機械可読（例 `queue_already_joined` / `room_full` / `invalid_rules`）、
`ref` は原因となったクライアントメッセージの `t`。
エラー一覧は `shared/ws/errors.ts` に列挙し本書の各節に個別記載。

### 2-D. レート制限（サーバ側・接続単位）

| 対象 | 上限 | 超過時 |
|---|---|---|
| ゲームWS `input` | 40 msg/s（30Hz 送信 + ジッタ余裕） | 超過分を黙って破棄（切断しない） |
| ロビーWS 全種 | 5 msg/s / 接続 | `error(rate_limited)`、正常受理を挟まず10回連続超過で close `4005` |
| `room_create` | 3 回/分/ユーザー | `error(rate_limited)` |
| `room_join` | 20 回/分/ユーザー | `error(rate_limited)`（コード総当たり対策） |

---

## 3. ロビー WS 仕様（`/ws/lobby`）

ログイン成功後に SPA が常時1本張る。
用途は (1) presence、(2) マッチメイキング、(3) カスタムルーム、
(4) 試合結果のライブ反映（モジュール #5「接続/切断処理・ブロードキャスト」の主たる証拠部分）。

### 3-A. サーバ→クライアント

`app/shared/src/ws/lobby.ts` では以下を閉じた discriminated union として定義する。
ID は DB の `Int` と同じ正の整数、`room_id` と招待 `code` だけを文字列とする。

| t | d（厳密な形） | 契機 |
|---|---|---|
| `lobby_hello` | `v:1`, `online_count:int`, `self:{status}` | 認証・接続登録の直後に必ず最初に1回。`online_count` はロビーWSを持つユニークユーザー数 |
| `presence_update` | `user_id:int`, `status: online\|in_queue\|in_game\|offline` | 状態変化時。**accepted friend の接続にのみ**配信し、全体ブロードキャストしない |
| `queue_state` | `mode`, `position:int`（1始まり）, `waiting:int`, `auto_fill_in_ms:int`, `is_leader:bool` | キュー変化時 + 非空中の1秒周期。キュー参加者だけへ個別送信 |
| `match_found` | `room_id:string`, `mode`, `slot:int` | W-09 の GameRoom 生成成功後。人間参加者だけへ個別送信 |
| `room_state` | `code`, `mode`, `state:open\|starting`, `host_id:int`, `rules`, `seats[]` | LobbyRoom 変化のたびに所属者へ全量再送 |
| `match_result` | `match_id:int`, `mode`, `end_reason`, `winner_team:0\|1\|null`, `winner_user_id:int\|null`, `players[]` | W-13 の永続化成功後、**ロビー全接続へ**同一文字列を配信 |
| `error` | §2-C | 操作を受理できなかった送信元だけへ |

`room_state.seats[]` は
`{slot:int, user_id:int|null, display_name:string|null, is_ai:bool}` とする。
空席は `user_id=null, display_name=null, is_ai=false`、AI席は
`user_id=null, display_name="AI", is_ai=true` とし、optional フィールドで状態を推測させない。

`match_result.players[]` は
`{user_id:int|null, display_name:string, is_ai:bool, team:int, slot:int,
result:win|lose|draw|abandon}`、`end_reason` は
`score|goal|forfeit|abandon` とする。RSP は `winner_team` だけを非 null にする。
FPS の人間勝者は `winner_user_id`、AI勝者は両winner列を null とし、
`players[]` のAI席1件を `win` にして表す。打ち切りは両winner列が null かつ
`end_reason=abandon` で区別する。この相互制約は zod の形に加えサーバ側の意味検証でも保証する。

### 3-B. クライアント→サーバ

| t | d | 検証・エラー |
|---|---|---|
| `queue_join` | `mode: rsp\|fps` | `idle` のみ受理。他キュー / LobbyRoom / match 中は状態別エラー（**1ユーザー1コンテキスト原則**） |
| `queue_leave` | — | 非参加なら no-op |
| `queue_fill_start` | — | キューリーダー（最古参加者）のみ受理。他は `not_leader`（D-2 の手動ボタン） |
| `room_create` | `mode`, `rules?`（§4-B。省略項目は既定値） | `idle` のみ。形は zod、マップ存在・モード一致はサーバで検証 |
| `room_join` | `code` | `idle` のみ。不存在 `room_not_found` / 満席 `room_full` / starting 中 `room_starting` |
| `room_leave` | — | 非所属なら no-op。open 中のみ退室、ホスト委譲は §4-B |
| `room_update_rules` | 完全な canonical `rules` | ホストのみ。部分更新ではなく全置換。starting 後は `room_starting` |
| `room_start` | — | ホストのみ。空席は AI で埋めて開始 |

presence の初期一覧（フレンド一覧+状態）は REST で取得し、以後の差分のみ本 WS で受ける（③で API 定義）。

`room_join.code` は shared スキーマで `trim → upper-case` に正規化してから
`^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$` を検証する。FE/BE が同じ変換を使い、
小文字入力や前後空白だけを理由に参加失敗させない。

### 3-C. ロビー専用エラーの閉じた一覧

`wsErrorCodeSchema` のロビー用コードを以下の閉じた一覧にする。既に定義済みのコードは維持し、
不足分を追加する。文言ではなく `code` で UI 分岐する。

| code | 発生条件 |
|---|---|
| `queue_already_joined` | 既にいずれかのキューにいる |
| `already_in_room` | LobbyRoom 所属中に queue / create / join を要求 |
| `already_in_game` | `starting_match` / `in_match` 中にロビー操作を要求 |
| `not_leader` | キュー外または先頭以外が `queue_fill_start` |
| `room_not_found` | コード不存在または既に GameRoom へ移行済み |
| `room_full` | 人間席が定員 |
| `not_host` | 非ホストが rules 更新 / start |
| `room_starting` | `open → starting` 予約後の join / update / start |
| `invalid_rules` | rules の形・範囲・マップID・モード対応が不正 |

内部の GameRoom 生成失敗は既存 `internal_error` を affected user 全員へ送り、
§4-E のロールバック後の `queue_state` / `room_state` を続けて送る。
未知メッセージ、4KB超、レート制限は §2 の共通コードを使う。
dispatcher は envelope で `t` を確定してから種別別schemaを検証する。
未知 `t` は `unknown_message`、`room_create` / `room_update_rules` のrules不正は
`invalid_rules`、それ以外の既知 `t` の形不正は `validation_failed` とする。
これらのschema違反だけを§2-Aの連続違反カウンタへ加算し、業務状態エラーは加算しない。

### 3-D. 接続確立・heartbeat・セッション失効

W-11 で実証済みの接続順序をロビーにも適用する。

1. `Origin` を `isAllowedOrigin` で検証。不一致は close `4003`。
2. 認証中にも message listener を先に付け、最大16フレームかつ合計64KBまで順序どおり保持する。
   それを超えたら close `4001`。認証後は同じ dispatcher へ流す。
3. `authenticateRequest` が null なら close `4000`。
4. user profile（`display_name`）を User repository から解決する。開発スタブ時だけ
   `dev-<userId>` を使用し、本番でDB解決失敗を匿名名へフォールバックしない。
5. 新接続を「現在の接続」として先に登録し、同一 user の旧ロビー接続へ close `4004`。
6. `lobby_hello` を送り、§3-F の現在コンテキスト再送を行う。

接続には単調増加する `connection_id` を持たせる。close handler は
「現在登録されている `connection_id` と自分が一致する」場合だけ状態掃除を行う。
置換された旧接続の遅延 close が新接続のキューやLobbyRoomを消してはならない。

サーバは10秒ごとに ping、pong 受信で生存フラグを戻す。2周期連続で pong が無ければ
`terminate()` し、通常の close handler へ集約する。timer は接続集合が空なら停止し、
Node プロセスを延命しないよう `unref()` する。W-08 で共通 heartbeat helper を作り、
既存 game WS も同じ helper へ移す（§1 の両エンドポイントに同じ規約を適用するため）。

ログアウト即時失効を開いているWSにも反映するため、接続を `session_id` でも索引化する。
W-04 の logout は Session 行を削除した直後に共通 `closeSessionConnections(sessionId)` を呼び、
lobby / game の双方を close `4000` にする。接続中のユニークSessionを60秒ごとに1回だけ
再検証し、有効ならD-5のスライディング期限を延長、無効なら同じcloseを行う。
再検証と logout hook の実体は W-04/W-05、接続索引と close API は
W-08 の共通WS基盤が所有する。したがって W-08 の機能実装は auth stub で先行できるが、
完了判定には W-05 の Origin と本セッション失効経路を含める。

開発時もブラウザは `location.host` を使って `/ws/lobby` へ同一オリジン接続する。
Vite は `/api` に加えて `/ws` を backend へ `ws: true` で proxy する。
本番は nginx が同じ2パスを振り分ける。ポート番号をクライアントへ埋め込まない。

### 3-E. UserContextRegistry（1ユーザー1コンテキストの正本）

W-08 はモジュールスコープに userId → context の Map を1つだけ持つ。
queue / LobbyRoom / W-09 が独自の「ユーザー所属Map」を正本にしてはならない。

| context | 保持する値 | 許可される次操作 | 公開 presence |
|---|---|---|---|
| `idle` | — | queue join / room create / room join | lobby接続あり=`online`、なし=`offline` |
| `queued` | `mode`, `joined_at`, `sequence` | leave / leader fill-start | `in_queue` |
| `in_room` | `code`, `joined_at` | leave / host update / host start | 接続あり=`online`、猶予中で接続なし=`offline` |
| `starting_match` | `token`, `source`, 凍結前context | ロビー操作不可 | quick由来=`in_queue`、room由来=接続状態どおり |
| `in_match` | `room_id`, `mode`, `slot` | ロビー操作不可 | `in_game`（lobby切断中でも試合終了までは維持） |

状態変更は**同期区間で context の期待値を比較してから1回だけ書き換える**。
外部I/Oを await した後の commit / rollback は `token` が一致する場合だけ行い、
古い非同期完了が新しい状態を上書きしない。

presence の状態は別Mapに二重保存せず、context と現在の lobby connection から導出する。
W-08 が `FriendResolver.getAcceptedFriendIds(userId)` interface を所有する。
状態変化ごとに version を増やし、その非同期結果が返った時点で version が古ければ送信を捨てる。
これにより `online → in_queue` のDB検索完了順が逆でも古い `online` を後から配信しない。
W-08 単体では fake resolver で「friend のみに届く」を検査し、後続W-07が同じinterfaceへ
Prisma adapterを差し込む。これで W-08→W-07 の依存方向を守る。
`GET /api/friends` は本Registryの `getPresence(userId)` を読む。

`match_result` だけは friend 制限を掛けず、現在の lobby 接続すべてへ1回だけ stringify した
同一文字列を送る。送信バッファ1MB超は close `4005`。ロビー通知は snapshot と違い
再送元がないため、途中のメッセージを64KBで間引かない。

### 3-F. close・再接続時のコンテキスト処理

close の理由ごとの扱いを次で固定する。

| close時のcontext / 理由 | 処理 |
|---|---|
| `replaced`（4004） | **何もしない**。新接続が同じcontextを引き継ぐ |
| `queued` | 仕様どおり即時離脱。キュー再計算と残留者への `queue_state` |
| `in_room`（通常断・heartbeat断） | 席を10秒保持。再接続でtimerを取消し `room_state` 再送。満了で `room_leave` と同じホスト委譲/解散 |
| `in_room`（明示logout / Session失効） | 猶予を置かず即退室。ログアウト後の幽霊席を残さない |
| `starting_match` / `in_match` | Lobby側では取り消さない。GameRoom参加待ち10秒 / W-12のgame WS猶予30秒が処理する |
| `idle` | offline への presence 更新だけ |

LobbyRoom の10秒は**試合中の再接続猶予30秒とは別の値**である。フロントの
1s→2s→5s backoff で3回目までに復帰でき、無期限の幽霊席も作らないため10秒とする。

再接続・置換後は `lobby_hello` に続けて現在contextを再送する。

- `queued`: 最新 `queue_state`
- `in_room`: 最新 `room_state`
- `starting_match`: 元contextの状態を再送し、操作は `room_starting` / `already_in_game` で拒否
- `in_match`: 同じ `{room_id, mode, slot}` の `match_found` を再送して `/game/:roomId` へ復帰可能にする
- `idle`: 追加送信なし

---

## 4. マッチメイキング詳細仕様

### 4-A. クイックマッチ（FIFO キュー）

- キューは**モード別に2本**（RSP / FPS）。データはメモリ内 FIFO（順序=参加時刻）。サーバ再起動でキューは消えてよい（試合中データと違い永続化しない）。
- 各entryは `user_id / display_name / joined_at / sequence` を保持する。
  同一ミリ秒参加でも `sequence` で全順序を確定し、配列の暗黙順だけに依存しない。
- 成立人数: RSP=4 / FPS=2。**成立判定は参加・離脱・手動開始・タイムアウトのイベント時のみ**（ポーリングしない）。
- スロット割当: キュー先頭から `slot 0,1,2,3` を付与。
  **RSP のチームは slot 0,1=チームA / slot 2,3=チームB**（偶奇ではなく連番。
  フレンドと連続参加すると同チームになりやすい、を意図した仕様とする）。FPS は slot 0,1。
- **D-2 の定員未達開始**: キュー先頭（リーダー）の画面に「AIを埋めて今すぐ開始」を常時表示（`queue_state.is_leader`）。
  加えて**最古entryの `joined_at + 60秒`**で自動発火（`auto_fill_in_ms` が 0 到達）。
  どちらの場合も不足席を `is_ai: true` で埋めて成立させる。
- リーダー離脱時は次entry自身の `joined_at + 60秒` へtimerを張り直す。既に期限超過なら
  次のevent-loop turnで即発火し、新リーダーへ新たな60秒を与え直さない。
- modeごとに成立用 `setTimeout` を1本、表示更新用の1秒timerを全キュー共通で1本だけ持つ。
  fake clock / injected `now()` で60秒を実待機せず検査できるようにする。
- 切断（ロビーWS断）はキューから即時離脱。再入は明示的な `queue_join` のみ。
- `queue_join` で定員に達した場合、`queue_fill_start` とtimeoutより先に、同じ同期区間で
  先頭人数を `starting_match` へ claim する。選ばれなかったentryは順序を保つ。
- ロビー全種5 msg/sは接続単位だが、`room_create` 3回/分と `room_join` 20回/分は
  userId単位で再接続をまたいで数える。コード総当たりと再接続による制限回避を防ぐ。

### 4-B. カスタムルーム（D-1）

- `room_create` でルームコード発行: exact alphabet
  **`ABCDEFGHJKLMNPQRSTUVWXYZ23456789`**（32文字）から `node:crypto.randomInt` で6文字。
  有効期間はLobbyRoom存続中のみで、認証・参加権限の代わりには使わない。
- **コード発行は原子的に行う**: 生成 → `Map.has` → `Map.set` を await 無しの単一同期区間で
  完結する。衝突時は再生成し、32回失敗したら `internal_error` と構造化ログ。
  RNGを注入可能にして、検査では意図的に衝突させて再試行を確認する。
- ホスト権限: `rules` 変更・`room_start`・（暗黙に）解散。ホストが退室したら**最古参加者へホスト委譲**、全員退室で即解散。
- LobbyRoom は `state: open|starting` を持つ。人間は空いている最小slotへ入り、
  `joined_at / sequence` を別途保持してホスト委譲順を確定する。
- ルール（#11 カスタマイズの実体。W-09 が確定値を使い、W-13 が
  `Match.settingsJson` にそのまま保存する）:

| フィールド | 型・範囲 | 既定 | 対象 |
|---|---|---|---|
| `map` | サーバ提供マップ一覧のID（`GET /api/maps` ③で定義） | モード既定マップ | 両方 |
| `target_score` | int 3–21 | 10 | RSP のみ（G-05 の `match_rules.target_score`） |

- **実装レビューによる縮小（2026-07-30）**: 以前の表にあった
  `move_speed_mult / enemy_speed_mult / ai_level` は、現行 `t_match_rules`、
  `GameRoom.create`、`createRoomFromRules` のどこにも適用口が無い。
  受理して保存だけすると「UIで変えたのに試合へ効かない」ため W-08 の wire から削除する。
  将来追加する場合はエンジンAPI→GameRoom→shared schema→本表の順に拡張する。
- canonical rules は RSP=`{map, target_score}`、FPS=`{map}`。`room_create` の省略項目は
  サーバが既定値で埋め、以後の `room_state` / `room_update_rules` / MatchPlan では全項目必須。
  zod object は strict とし、削除済みフィールドを黙って捨てない。
- `map` は zod の文字列検証後、W-14 `findMap` で存在・mode一致を意味検証する。
  不一致は `invalid_rules`。任意パスやクライアント提供 `.cub` は受理しない。
- クイックマッチは常に既定 canonical rules（RSP=`rsp/10`、FPS=`fps_duel`）。
  これにより「キュー参加者間のルール合意」問題を排除する（D-1 の設計意図）。
- 席: モード定員分の `seats[]`。人間が埋めない席は開始時に AI 化。**最低1人の人間（ホスト）がいれば開始可**（全AI試合は作れない）。
- `open` 中の join / leave / rules 更新は処理完了後に所属者全員へ同じ `room_state` を送る。
  `starting` 中は席・host・rulesを一切変更しない。

### 4-C. 成立からゲーム開始まで（両方式共通）

```text
[同期claim] キュー満員 / fill-start / timeout / room_start
   │  対象userを starting_matchへ、LobbyRoomをstartingへ、rules/席を凍結
   ▼
[W-09 async] GameRoom 生成（§6）: game_create → 人間席/AI席を game_add_combatant
   │  成功: token付きcommit / 失敗: 元contextへrollback
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
- **10 秒経過で AI 化された席は、以後「早期開始を待つ人間席」の集合から除外**する。`created → countdown` の遷移は1回きりで、`playing` 中に早期開始の再判定はしない（**期待人間席は開始時点で凍結される**）。join の本人確認は常に participant 表の userId → slot を使い、humanSlots を認可には使わない。playing 中は §7 の grace 30秒以内かも席状態表で確認し、grace 満了後の abandoned participant は player として復帰させない（保1を実装した場合だけ spectator 可）。
- マッチ成立後のキャンセル UI は設けない（LoL 型 accept ダイアログは実装しない。評価デモのテンポを優先し、遷移は自動）。
- claim 後にロビーWSが切れても成立を取り消さない。未接続者は既存GameRoomの10秒待ちで
  AI化する。これにより非同期生成中の leave と commit の競合を作らない。

### 4-D. マッチメイキング状態機械（ユーザー視点）

```text
idle ──queue_join──► queued ──同期claim──► starting_match ──W-09成功──► in_match
  ▲                    │                       │失敗rollback                   │
  └──queue_leave/切断──┘                       └──接続あり───► queued        │
  ▲                                            └──接続なし───► idle          │
  │                                                                          │
  └────────────── match_end / 開始前closed ◄─────────────────────────────────┘

idle ──room_create/room_join──► in_room ──room_start claim──► starting_match
  ▲                                  │                          │失敗rollback
  └────room_leave/grace満了───────────┘                          └──► in_room
```

スコープ外（実装しない）: パーティ同時キュー、レート/ランク考慮マッチング、トーナメント、observer のキュー。観戦は §5-E のフックのみ。

### 4-E. W-08 → W-09 の唯一の引き渡し: immutable MatchPlan

W-08 は GameRoom を直接生成しない。同期claimの結果を、次の不変データとして1回だけ
W-09 の `prepareMatch` へ渡す。

| フィールド | 内容 |
|---|---|
| `token` | claimごとの内部一意ID。commit/rollbackの古さ検査に使いwireへ出さない |
| `source` | `quick(full\|manual\|timeout)` または `custom(code)` |
| `mode` | `rsp` / `fps` |
| `rules` | §4-B の canonical rules |
| `seats` | 定員ぶんの `{slot, user_id\|null, display_name\|null, is_ai}` |
| `participants` | 人間だけの `{userId, slot}`。GameRoomの本人照合表 |
| `human_slots` | 人間slot一覧。GameRoomの早期countdown判定 |
| `rollback` | quickは元の `joined_at/sequence`、customは凍結前LobbyRoom snapshot |

全配列・rules は claim 時にコピーして凍結し、元のqueue/LobbyRoomを参照させない。
Nodeがシングルスレッドでも `await GameRoom.create()` の間には別メッセージが処理されるため、
「checkしてからawait後に削除」してはならない。claim は次の順を await 無しで完了する。

1. 現context / room state / leader を再検証。
2. 対象全userを同じtokenの `starting_match` にする。
3. quick entryをqueueから除去、またはLobbyRoomを `starting` にする。
4. immutable MatchPlanを作る。
5. 同期区間を抜けてから W-09 を await する。

W-09 は既存 `createRoomFromRules({mode, rules, participants, humanSlots})` を呼ぶ。
成功時は `token` 一致を確認して全userを `in_match` にし、custom LobbyRoomを削除して
コードを失効させてから `match_found` を送る。失敗時は同じtokenのuserだけをrollbackする。
quick は現在 lobby 接続があるuserだけを元順序へ再挿入し、生成中に切断・logoutしたuserは
`idle` に戻す（切断済みuserのキュー自動復帰は禁止）。custom は `open` へ戻し、
通常断で接続がない参加者にはrollback時点から10秒の room再接続猶予を与える。
明示logout / Session失効済みの参加者は即退室としてからhost委譲または解散する。
接続中の対象へ `internal_error` と最新stateを送る。
二重 `room_start`、fill-startとtimeoutの同着、満員joinとtimeoutの同着はいずれも
最初のclaimだけが成功し、後続は `room_starting` / `already_in_game` となる。

`prepareMatch(plan, {signal})` の期限は5秒とし、fake timerを注入できるようにする。
期限時は `AbortController.abort()` して失敗rollbackする。W-09 は既存 `reserved Set` を
`Map<roomId, reservationToken>` へ変え、abort時も**自分のtokenと一致する予約だけ**を除去する。
Promise自体は取消不能なので、期限後にGameRoom生成が成功してもregistryへ登録せず即closeする。
通常成功でも全参加者のtoken一致を**一括確認してから**commitし、不一致なら
`closeRoom(roomId)` で生成済みGameRoomを破棄する。部分commit、孤児GameRoom、
`reserved` の残留を許さない。

試合終了時に `in_match → idle` へ戻すため、W-09 は GameRoom の lifecycle を購読する。
`match_end`（finished）または「人間0人のまま10秒でclosed」のどちらでも参加者を解放する。
現行 GameRoom に開始前closed通知が無いため、W-09 で `onLifecycle(state, reason)` hook を
RoomOptions/rooms registryへ追加する。ロビーがGameRoom内部stateをポーリングしてはならない。
finished では結果画面の60秒保持中でも user context は idle とし、次のキュー参加を許可する。

### 4-F. W-08 の実装配置

| ファイル | 責務 |
|---|---|
| `app/shared/src/ws/lobby.ts` | 本節の全zod schema / wire type。`ws/index.ts` からexport |
| `app/backend/src/lobby/state.ts` | UserContextRegistry、presence導出、connection/token付きcommit/rollback |
| `app/backend/src/lobby/queue.ts` | mode別FIFO、leader deadline、queue_state、quick MatchPlan claim |
| `app/backend/src/lobby/rooms.ts` | LobbyRoom、コード発行、host委譲、room MatchPlan claim |
| `app/backend/src/lobby/ws.ts` | `/ws/lobby`、認証、dispatcher、送信、置換、再送 |
| `app/backend/src/ws/connection.ts` | heartbeat、session_id索引、pre-auth上限などgame/lobby共通部 |
| `app/backend/src/lobby/lobby-check.ts` | fake clockの決定的検査 + 実WebSocket結合検査 |

`app/backend/src/game/rooms.ts` は GameRoom registry のまま変更せず、
LobbyRoomを同ファイルへ混ぜない。`index.ts` は websocket plugin 登録後の同じscopeで
`registerGameWs` と `registerLobbyWs` を登録する。

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

> **改訂（2026-07-11）**: 当初あった `hand`（RSP の選択手）フィールドは**削除**した（⑤
> [BACKLOG.md](./5-バックログ.md) D-17）。
> 手はリスポーン・自陣踏み込みで**サーバ権威**が変える状態であり、現行ルールにプレイヤーが手を選ぶ概念は存在しない。
> 入力面に出すとチートと不整合の入口になるだけである。

- **送信規約**: クライアントは表示フレームから **30Hz に間引いて全量状態を送る**（イベント駆動ではなく状態駆動）。
  パケットロスト相当（WS 断以外では起きない）でも次のメッセージが全量なので自己回復する。
  サーバは席ごとに最新 `input` を保持し、**毎 tick で `game_set_input` に適用**する（§3-B）。
- 入力は playing 状態でのみ受理（waiting/countdown/finished 中は黙って破棄）。

### 5-B. サーバ→クライアント

| t | d | 契機 |
|---|---|---|
| `welcome` | `v`, `role: player\|spectator`, `slot`, `combatant_id`, `mode`, `rules`, `map_text`, `tick_rate: 30`, `snap_rate: 15`, `interp_ms: 100`, `resume: bool` | join/spectate 受理直後 |
| `snapshot` | §5-C | 15Hz（2 tick に1回）。全参加者+観戦者に**同一シリアライズ済み文字列**を配信（クライアント別加工なし） |
| `event` | §5-D | 発生時 |
| `player_status` | `slot`, `state: connected\|ai\|grace`（grace=切断猶予中） | 席の人間/AI 切替時 |
| `error` | §2-C | — |

> **`resume` の判定について（2026-07-27 追補）**: `resume=true` にできるのは
> 「**その席が §7 の grace 状態にある**」と分かる場合だけで、席ごとの grace を持つのは **W-12**。
> したがって **W-11 単体では `resume` は構造的に常に `false`** になる。実装を読む人が
> 「バグでは」と疑わないよう明記しておく。W-12 で席の状態表ができて初めて正しく埋まる。

**マップ配布の決定**: `welcome.map_text` に**サーバがロード済みの `.cub` テキストを同梱**する。

| 案 | 長所 | 短所 | 判定 |
|---|---|---|---|
| **welcome に .cub テキスト同梱（採用）** | サーバとクライアントのマップ不一致が原理的に起きない（単一情報源）。カスタムマップ追加時も配信経路の追加作業ゼロ | welcome が数KB 太る（1回きりなので無害） | ◎ |
| 静的アセットを fetch | welcome が軽い | アセットとサーバロード内容の乖離リスク。バージョン管理が増える | × |

クライアントは `map_text` を render 側の `game_create`（表示用）に渡す（§3-B の「.cub のメモリ上テキスト」引数と同一経路。
native/web/サーバの三者が同じパーサを通る）。テクスチャは従来どおり静的アセット（E-06 の `.tex`）。

### 5-C. snapshot ペイロード（§3-D と 1:1 対応）

```
{ "t":"snapshot", "d":{
  "tick": 12345,
  "match": { "state":"waiting|playing|finished", "mode":"rsp|fps",
             "winner": null|0|1|combatant_id, "score":[7,4] },
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
| `match.mode` | -（本書 §5-C で新設） | `rsp` \| `fps`。**snapshot 単体で `match.winner` の意味（RSP=チーム番号 / FPS=combatant_id）を確定できる**ようにする（受入 №5 の観戦・リプレイ・録画リプレイ用途で必須）。welcome の mode と同一で試合中は変化しない。値は 2 バイト程度でサイズ予算 1KB に影響しない |
| `match.winner` | 勝者 | RSP=チーム番号 / FPS=combatant_id / 未決着=null。**解釈は `match.mode` で確定**する |
| `match.score` | スコア | RSP=チーム別 `[A,B]` / FPS=`[0,0]` 固定（勝敗はゴール到達のみ） |
| `combatants[]` | id/team/hand/pos(x,y)/dir_angle/alive/is_ai/respawn_timer | FPS の敵ハザードも同形式で含む（クライアントは区別せず描画）。`respawn_ms` はミリ秒残量 |
| `world_delta` | 収集済みアイテム座標・扉開放フラグ | **含まれる時のみ処理**（差分。初回 join/再接続時は welcome 直後の最初の snapshot に全量を必ず含める） |

- サイズ予算: 4人+敵数体で **1KB 未満/回** を維持（§3-D）。フィールド追加時はこの予算を受入条件として検査する。
- **補間契約（クライアント責務）**: スナップショットをバッファし、`now - 100ms` の時点を挟む2つで線形補間（角度は最短弧）。
  自分の `yaw` のみローカル値を優先（視点回転の即時適用）。
  補間結果を `game_apply_snapshot` で表示用 `t_game` に書き `render_frame` を呼ぶ（§3-B の分担どおり。
  **クライアントに勝敗判定コードは存在しない**）。

#### なぜ配信は 15Hz なのか（シム 30Hz・描画 60fps との関係）

> **前提の確認**: 補間は「2枚のスナップショットから1枚の絵を作る」処理**ではありません**。
> 「2枚の**間の任意の時刻**の状態を作る」処理です。`alpha` は 0.0〜1.0 の連続値なので、
> **同じ2枚が alpha を変えながら何フレームも使い回されます**（15Hz なら1組で約4フレーム）。
> したがって**配信頻度は描画 fps を制限しません**。15Hz でも 60fps は出ます。

配信頻度で実際に変わるのは、**滑らかさではなく次の2つ**です。

| 変わるもの | 15Hz にすると |
|---|---|
| **帯域** | 30Hz の半分。下り ~500B × 15Hz ≈ 7.5KB/s/クライアント（§9） |
| **軌跡の正確さ** | 補間は2点間を直線で結ぶため、66.7ms ぶんの曲がりをショートカットする。歩行速度では数 cm 相当で、目視では判別できない |

**15Hz は「100ms の補間遅延に収まる範囲で最も軽い」点として選んでいます。**
補間には「描きたい時刻を挟む2枚」が常に必要で、`now - 100ms` の遅延はその猶予です。

| 配信 | snapshot 間隔 | 100ms 予算に対して |
|---|---|---|
| 30Hz | 33.3ms | 余裕 67ms（過剰。帯域を倍払う見返りが無い） |
| **15Hz（採用）** | **66.7ms** | **余裕 33ms。1枚の遅延・ゆらぎを吸収できる** |
| 10Hz | 100ms | 余裕ゼロ。1枚落ちると補間できず位置が飛ぶ |

⓪ §2.3 が「15–20Hz」と幅で書いているのはこの範囲を指しており、
**偶数 tick のみ配信 = ちょうど 15Hz** が §6-A の実装として最も素直なため、これを採る。

なお `web/snapshot_interp.js` は**離散値（`state` / `score` / `hand` / `alive` / `team`）を補間せず、
古い側のスナップショットの値をそのまま使う**。スコアが 0.5 点になる余地を作らないためで、
「ブラウザは判定を作らない」という本節の原則と同じ理由による。

### 5-D. event 種別

ARCHITECTURE §2.3 の 4 種を核に、ルーム層イベントを追加した閉じた列挙とする。

| kind | d | 発生 |
|---|---|---|
| `countdown` | `seconds: 3` | 接続待ち完了時 |
| `match_start` | — | countdown 満了（この時点で state=playing） |
| `point_scored` | `team`, `score:[a,b]`, `by_id` | RSP 得点時（演出・効果音トリガ。値の正本は snapshot 側） |
| `hand_changed` | `id`, `hand` | 手の変更時（同上） |
| `goal` | `id` | FPS ゴール到達 |
| `match_end` | `winner`, `reason: score\|goal\|forfeit\|abandon`, `match_id:int\|null` | 決着。`match_id` は永続化済み DB 行の正整数（結果画面が REST で詳細取得）。**§6-C の順序で永続化完了後に発火する**。永続化失敗時だけ null とし、DB行が無いので `match_result` も送らない。クライアントは最終snapshotの勝敗・スコアだけで結果画面を表示する |
| `player_disconnected` | `slot`, `grace_ms: 30000` | 切断検知（→ player_status: grace） |
| `player_reconnected` | `slot` | 猶予内復帰（→ player_status: connected） |
| `ai_takeover` | `slot` | 猶予満了 or `leave` による AI 化（→ player_status: ai） |

イベントは**演出・通知のトリガ**であり、ゲーム状態の正本は常に snapshot（イベントを取りこぼしても状態は snapshot で追いつく設計。
再接続時にイベント再送はしない）。

### 5-E. 観戦フック（保1。実装は余力時のみ、設計コストのみ先払い）

- `spectate` を受けた接続は **snapshot/event の配信集合に追加されるだけ**（`welcome.role=spectator`,
  `slot=null`）。
  `input` は黙って破棄。
- 視点切替はクライアント内で完結（snapshot は全戦闘員の pos/dir を含むため、任意の戦闘員視点で `render_frame` 可能）。サーバ追加コストゼロ。
- 参加資格: playing 中の任意ログインユーザー。ルーム一覧 API（③）は保1着手時に追加。

---

## 6. GameRoom 状態機械とライフサイクル

**1試合 = 1ルーム = 1つの `sim.wasm` インスタンス**（確定済み）。
ルームはモジュールスコープの Map（`room_id → GameRoom`）で同時複数保持（マルチユーザー要件の根拠）。

### 6-A. 状態機械

```
created ──全人間join or 10s──► countdown(3s) ──► playing ──決着──► finished ──60s──► closed
   │                                               │(全人間席がgrace満了/abandon)
   └── 人間0人のまま10s ──► closed（記録なし）        └──► finished(abandon)
```

| 状態 | tick 駆動 | input 受理 | 摘要 |
|---|---|---|---|
| created | しない | しない | `game_create` + 全席 `game_add_combatant` 済み。接続待ち。**生成時に「人間席の slot 一覧」を受け取る**（下記） |
| countdown | しない | しない | `event(countdown)` → 3秒後 `event(match_start)` |
| playing | **30Hz `setInterval`** で `game_step(game, 1/30)`、偶数 tick で `game_snapshot` → JSON → 一斉配信 | する | 唯一の正 |
| finished | しない（最終 snapshot は配信済み） | しない | 永続化（§6-C）→ 結果画面用に 60 秒接続維持 → close 1000 |
| closed | — | — | `game_destroy`、Map から除去 |

> **追補（2026-07-27）— 席の状態はルーム状態と「直交する別の次元」である**
>
> 上の表が持つのは**ルーム全体の状態**（created / countdown / playing / finished / closed）だけ。
> 一方 §5-B の `player_status` は席ごとに `connected` / `ai` / `grace` の3値を持ち、
> §7-A は「切断 → grace 30秒 → ai_takeover」という**席ごとの遷移**を定めている。
> grace 満了時、席は `ai` へ遷移し（入力源が AI に切り替わる）、同時にその席を `abandoned` と記録する。
> `abandoned` は `player_status` とは別のフラグで、試合終了時の結果判定（`endReason: 'abandon'`）に使う。
> §6-A の `finished(abandon)` は「全人間席が abandoned になった」場合のルーム遷移を指す。
>
> **この2つは別の次元であり、ルームの状態機械に grace を足すのではない。**
> ルームが `playing` のまま、席1が `grace`・席2が `ai`・席3が `connected` という状態が正常にありうる。
> §6-A の「playing ──(全人間席が grace 満了/abandon)──► finished」という矢印は、
> **席の次元の集計結果がルームの遷移を引き起こす**ことを表している。
> W-12 は席の状態表を新設する形で実装すること（ルーム状態機械の拡張ではない）。
>
> ---
>
> **追補（2026-07-27）— ルームは「人間席の slot 一覧」を生成時に受け取る**
>
> §4-C は countdown への遷移条件を「**全人間席の join 完了** or 10秒経過」と定めているが、
> ルームは全席を AI で生成する（§6-B）ため、**どの slot が人間の席なのかを自力では知り得ない**。
> 割り振りを知っているのはマッチメイキング側（§4-A のスロット割当・不足席の AI 埋め）なので、
> **GameRoom 生成時に人間席の slot 一覧を渡す**ことを仕様とする。
>
> | | |
> |---|---|
> | 渡す側 | マッチメイキング（W-09）。クイックマッチはキュー先頭から、カスタムルームは `seats[]` から導出 |
> | 受け取る側 | GameRoom（W-10）。`humanSlots: number[]` として保持 |
> | 用途 | countdown への早期遷移判定（**この一覧の全 slot が join したら10秒を待たずに進む**） |
> | 省略時 | 全席が人間（クイックマッチで定員ちょうど埋まった場合と同じ） |
> | `[]`（空配列） | 人間席なし（AI のみのルーム）。早期 countdown 条件は適用せず、既定の 10 秒タイムアウトで countdown へ遷移する。countdown 判定で `humanSlots.length > 0` を確認すること |
>
> **これが無いと、人間2人 + AI2席の試合が毎回10秒待たされる**（早期開始の条件が
> 「定員ぶんの人間が揃う」になってしまい、永久に成立しないため）。
> `humanSlots` は早期countdown専用で、join の認可は `participants` 表が正本。
> participant に登録されたslotは一覧から除外後もgrace中の再接続対象になりうるが、
> 最初からAIとして割り当てた未登録slotを別ユーザーが取ることはできない。
> participant外または**定員外の slot は close `4003`（参加権なし）で弾く**。

### 6-B. sim API（§3-B）との対応表

| ルームのイベント | 呼び出す sim API | 備考 |
|---|---|---|
| ルーム生成 | `game_create(cub_text, mode, match_rules)` | §4-B の `map` は W-14 が cub_text に解決し、RSP の `target_score` だけが現行 `match_rules` に入る。`humanSlots` は GameRoom 側のアプリケーションメタデータで sim API には追加しない |
| 席の確定 | `game_add_combatant(game, slot, is_ai)` × 定員 | 人間未接続席も**先に AI で生成**し、join 時に入力源を EXTERNAL へ切替（下記追補） |
| `input` 受信 | 席バッファに保持 → 毎 tick `game_set_input(game, combatant_id, t_input)` | `mv`/`yaw`/`act` → `t_input` への写像は platform/headless 層の責務（`hand` は D-17 で `input` から削除済み。手はサーバ側エンジンが決める）。実装済みのラッパは `sim_set_input(game, id, forward, backward, strafe_left, strafe_right, yaw)` |
| tick | `game_step(game, dt=1/30)` | 戻り値（進行中/決着）で finished 遷移を判定 |
| 配信 | `game_snapshot(game, buf)` → JS で JSON 化 | シリアライズは Node 側。wasm 内で文字列化しない |
| 破棄 | `game_destroy(game)` | closed 遷移時 |

> **§3-B への追補要求（本書からの唯一のエンジンAPI追加）**: 切断時 AI 代替⇔復帰は §3-C で
> 「入力源の付け替えで済む」設計だが、§3-B の公開 API 表に該当関数がない。
> **`game_set_input_source(game, combatant_id, AI|EXTERNAL)` を公開 API に追加すること**。
> E-10（sim 公開 API）と G-02（入力源抽象）の受入条件に本関数を含める（⑤のバックログで反映）。
>
> **✅ 対応済み（2026-07-23）**。この追補要求はエンジン側で実装され、
> [`codes/includes/platform/sim.h`](../../codes/includes/platform/sim.h) に
> `game_set_input_source` として公開されています。**エンジン側に残作業はありません。**
> 上の表の sim API は 6 つとも実装済みで、呼び出し順の具体的な手順は
> [3-エンジンPhase3レポート](../03_実装レポート/3-エンジンPhase3レポート.md) の
> 「W-10 への申し送り」にまとめてあります。

### 6-C. 試合終了時の永続化と結果配信

1. 最終 snapshot（`match.state=finished`）配信。この時点でクライアントは勝敗と最終スコアを知る（値の正本は snapshot 側）。
2. Prisma で `Match` + `MatchPlayer` を書き込み（**AI 席も行として残す**。§3.3 準拠）。`result` の帰属規約:

| ケース | 記録 |
|---|---|
| 通常決着（score/goal） | 勝者側 win / 敗者側 lose |
| FPS 不戦勝（forfeit） | 残留側 win(reason=forfeit) / 離脱側 **abandon** |
| RSP 途中離脱して未復帰のまま決着 | 本人は**チーム結果に関わらず abandon**。復帰済みなら通常判定 |
| 全人間離脱で打ち切り | `winnerTeam=null`、全離脱者 abandon（AI 席は draw 扱いで統計から除外） |

3. **`event(match_end)` を game WS に配信**（`d.match_id` に 2. で採番された正整数を含める。永続化失敗時のみ null として失敗ログ）。**この順序（永続化 → match_end）を逆にしない**。実装は最終snapshot直後に永続化を開始し、await後に送る。
4. 永続化成功時だけロビー WS へ `match_result` をブロードキャスト（§3-A）。DB行と同じ `match_id` を含め、game WS の `match_end` より後に送る。失敗時はDB行もIDも存在しないため、`match_result` を架空生成しない。
5. 60 秒後 close 1000 → `game_destroy`。結果画面の詳細（履歴・統計への反映）は REST（③）で取得。**60 秒のカウントは `event(match_end)` 発火時点から**（永続化に長時間かかった場合の切れ端を避ける）。

W-09 は MatchPlan を閉じ込めた永続化closureを GameRoom へ渡す。
`PersistedMatchContext` の outcome（winner/reason/score/tick）だけでは
`MatchPlayer`、map、settingsを作れないため、closure側で MatchPlan の
`seats / participants / rules` と結合する。`createRoomFromRules` は現在
`persistMatch` と `onMatchResult` を RoomOptions へそのまま転送する。
`persistMatch` は `{matchId:int, result:match_result payload}` を返し、GameRoom は
`event(match_end).d.match_id=matchId` をgame WSへ送った直後に
`onMatchResult(result)` を呼ぶ。W-09/W-13がそのhookをロビー全接続への
`match_result` 配信へ接続する。null/例外ならmatch_endをnullで送り、hookは呼ばない。

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

- **本人確認はセッション Cookie のみ**で行う（専用の再接続トークンは発行しない。
  ARCHITECTURE §2.3 の「セッショントークン」はログインセッションを指すと解釈し、二重のトークン系を作らない）。
  セッション失効時はログイン画面へ→再ログイン後も猶予内なら復帰可。
- FPS 1vs1: 猶予中も試合は続行（AI が代走）。**猶予満了で不戦勝**（`match_end(reason=forfeit)`）。
  両者切断は先に満了した側が abandon。
- `leave`（明示退室）は猶予なしで即 `ai_takeover`（FPS は即 forfeit）。
- RSP で全人間席が grace/ai になった場合: **30秒の猶予窓のうちは AI のみで継続**（誰かの復帰を待つ）。
  全席の猶予が切れたら abandon で打ち切り（§6-C）。

### 7-B. 評価デモ台本フック

タブを閉じる→別タブでログイン→`/game/:roomId` へ再入→復帰、が 30 秒で完結すること（D-3 の選定理由）。
`player_status` により他プレイヤーの画面に「切断中(AI)」表示が出ることを HUD 仕様（④）に引き継ぐ。

---

## 8. 異常系・セキュリティ・性能予算

| 項目 | 仕様 |
|---|---|
| 入力検証 | 全メッセージを zod（shared 共有）+ サーバ側意味検証（yaw 有限値・範囲、seq 単調、rules 範囲・map存在/mode一致、context/host権限）。二重検証が「FE/BE 双方での検証」要件の WS 側の証拠 |
| バックプレッシャ | game WS は64KB超で snapshot だけスキップ（event は落とさない）。lobby WS は全通知を保持する。両方とも1MB超で close 4005（回線死判定） |
| ロビー競合 | queue/LobbyRoom/context の変更とMatchPlan claimは await無し。非同期完了はtoken比較でcommit/rollbackし、二重start・古い完了による上書きを防ぐ |
| tick 過負荷 | `game_step` 所要が周期の 50% を超えた場合に警告ログ（監視保4のメトリクス候補）。ルーム数上限は設けない（4人×数ルームの評価規模では不要。負荷試験 Day 12 で確認） |
| 時刻 | クライアントとの時計同期はしない。補間は「受信時刻ベースの相対時間」で行う（snapshot 到着間隔から描画時刻を導出。NTP 的機構は YAGNI） |
| ログ | 接続/切断/queue join・leave/room create・join・leave/claim・rollback/match 成立/永続化を構造化ログ（pino）。Cookie・生token・game input はログしない |
| 帯域見積 | 下り: ~500B × 15Hz ≈ 7.5KB/s/クライアント。上り: ~60B × 30Hz ≈ 1.8KB/s。デモは4窓（§10-5）だが、**仮に8窓でも合計 100KB/s 未満**で余裕がある |

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
| 1ユーザー1コンテキスト / presence | §3-E（UserContextRegistryから導出。queue/roomの二重Mapを正本にしない） |
| 同時操作で競合・二重成立しない | §4-E（同期claim + token付きcommit/rollback） |
| logout即時失効 / WS Origin | §3-D（session_id索引で両WSをclose）+ §1 |
| W-08/W-09の責務境界 | §4-E（W-08=immutable MatchPlan、W-09=GameRoom生成とlifecycle連携） |
| JSON 開始・バイナリ化は YAGNI | §2-A + §5-C サイズ予算（1KB 未満/回を受入条件化） |
| game_create/add_combatant/set_input/step/snapshot/apply_snapshot/destroy | §6-B 対応表（唯一の追補 = `game_set_input_source`） |

## 10. 受入条件（⑤バックログ W-xx/B-xx の種）

### 10-A. W-08 単体の完了条件

`app/backend/src/lobby/lobby-check.ts` で次を自動検査し、1件でも観測数0なら失格とする。

1. **接続**: 正しいOrigin/Cookieで最初のメッセージが `lobby_hello(v=1)`。
   未認証4000、異Origin4003、4KB超4001、違反10回4001、同一user置換4004。
   置換旧socketのclose後も新socketのcontextが残る。
2. **heartbeat/session**: pongなし2周期で掃除され、logout hookで同じsessionの
   lobby/game双方が4000。timer/接続Mapがテスト終了後0件。
3. **FIFO**: RSP/FPSが独立し、同一時刻はsequence順。join/leaveごとに全残留者の
   `position/waiting/is_leader` が正しい。切断entryは即時離脱。
4. **成立claim**: 満員、leader手動、fake clockの60秒の3経路で MatchPlan が各1件だけ。
   fill-start/timeout同着、二重room_start、満員join/timeout同着でも合計1件。
5. **rollback**: W-09を意図的に失敗させ、接続中quick参加者が元FIFO順、customが同じ
   host/rules/seatsの `open` へ戻り、古いtokenの遅延完了が状態を変えない。
   生成中に切断したquick参加者は戻らず、custom通常断は10秒grace、logoutは即退室になる。
   5秒timeout後の遅延成功でもGameRoom/`reserved`/timerが残らない。
6. **LobbyRoom**: コード衝突再試行、lower-case参加、満席、非host拒否、
   `target_score=2/22`拒否、mode違いmap拒否、host委譲、全員退室で削除。
7. **再接続**: room所属者は9.9秒で復帰して同じ席、10秒満了で退室。
   queuedは再接続しても自動復帰せず、in_matchは `match_found` が再送される。
8. **presence**: fake friend関係 A-B / A-C非friend で、Aの4状態変化がBだけに届く。
   非同期resolverを逆順完了させても古いversionが後着しない。`online_count` は置換で増減しない。
9. **wire**: 全送受信を `lobbyClientMessageSchema` / `lobbyServerMessageSchema` で再parseし、
   `room_state` は空席/AI席をnullとis_aiで一意に区別できる。全IDの型が③ D-10と一致する。
10. **開発経路**: Viteの同一オリジン `/ws` proxy経由でもCookie付き接続が成立する。

W-08 の完了は「試合が動くこと」ではなく、上記と**両開始経路で immutable MatchPlan が
ちょうど1件生成されること**まで。GameRoom生成・`match_found`・開始前closedの解放は
W-09の結合条件とする。

### 10-B. W-09以降を含む全体E2E条件

1. 2ブラウザ+AI 2席で RSP クイックマッチが成立し、先取点到達→`match_end`→DB 行→ロビーの `match_result` 受信まで通しで動く。
2. 「AIを埋めて今すぐ開始」ボタンと 60 秒自動開始の両経路で試合が成立する。
3. カスタムルーム: コード招待で入室→ホストが `target_score=3` に変更→開始→3点で決着する。
4. 試合中にタブを閉じ、30 秒以内の再入で人間に復帰する（他画面に grace/ai/connected の遷移が表示される）。
   FPS では 30 秒放置で不戦勝が記録される。
5. snapshot が 1KB 未満/回であることを負荷テストで実測。**下の2つのデモでコンソールエラーなし**。

   > **改訂（2026-07-27）: 「8 ブラウザ同時」をやめ、4窓のデモ2本に分けた。**
   >
   > チームは4人・評価者1人なので、8窓は**全員が2窓ずつ操作する**ことになり現実的でない。
   > また8窓を1台で開くと `render.wasm` が8インスタンス同じ CPU を食う
   > （E-13 の実測 960×540=112fps は**1インスタンスの値**）。
   > 示したい要件は別物なので、**デモを分ければどちらも4窓で足りる**。
   >
   > | | 示す要件 | 構成 |
   > |---|---|---|
   > | **デモA** | コア #3 マルチプレイヤー3人以上（Major 2pt） | **1ルーム・人間4人・AI 0席** |
   > | **デモB** | 課題書 III.2 マルチユーザー同時利用（**拒否条件**） | **2ルーム・各「人間2 + AI2」= 計4窓** |
   >
   > **デモA で AI 席を使わないこと**が重要。全ルームが「人間2 + AI2」だと
   > 「3人以上」を AI で数えることになり、#3 の 2pt が弱くなる。
   >
   > **デモB は2ルームであることが要点**で、各ルームの人数は要件に関係ない。
   > III.2 の「同時のユーザーアクションによってデータの破損や競合状態が発生しない」は、
   > **独立した2ルームが同じ DB・同じロビーへ同時に書いて初めて示せる**（1ルームでは
   > 競合が起きる場面が無く、「壊れなかった」ではなく「壊れる状況を作っていない」だけ）。
   >
   > **可能なら4台の別 PC から接続する。** コア #2 リモートプレイヤー（Major 2pt）は
   > 課題書 IV.6 が「**別PC間**でリアルタイムプレイ」と明示しており、1台で8窓開くデモでは
   > この 2pt の主張が弱い。別 PC からなら #2・#3・III.2 が同時に成立し、
   > 描画負荷も1台あたり1窓で済む。**その場合は全 PC に mkcert の CA を入れること**
   > （⓪ §9.1）。nginx が LAN の名前で待ち、`ALLOWED_ORIGIN`（W-05）がそれを許可している
   > 必要もある（W-15 の範囲）。
6. 不正メッセージ（スキーマ違反・巨大ペイロード・seq 逆行・範囲外 rules）がすべて仕様どおりのエラー/破棄になる。

---

## 改訂記録

| 日付 | 内容 |
|---|---|
| 2026-07-11 | §5-A・§9: `input.hand` を削除（⑤ [BACKLOG.md](./5-バックログ.md) D-17。選択肢比較は ⑤ §0） |
| 2026-07-23 | §6-B: 「§3-B への追補要求」が**実装済み**であることを明記（`game_set_input_source`）。同表に残っていた `hand`（D-17 で削除済み）を `act` に訂正し、実装済みラッパ `sim_set_input` の引数を追記。長い行を折り返して可読性を改善 |
| 2026-07-29 | 設計不備 4 件の解消（W-08〜W-13 実装前の穴埋め）: 部屋コード発行の原子性／期待人間席の凍結／snapshotのmode／永続化後のmatch_end発火を追補。`room.ts` と `game.ts` に反映 |
| 2026-07-30 | **W-08設計完成**: W-01/W-10/W-11/W-14の実装パターンを§0-Aに固定。ロビーwireの全型、UserContextRegistry、friend限定presence、置換/room再接続10秒、heartbeat/session失効、FIFO deadline、LobbyRoom canonical rules、同期claim+token rollback、immutable MatchPlanによるW-09境界、実装配置、W-08単体受入10項目を追加。未実装の速度倍率/AI強さをwireから削除。grace満了後の復帰可という旧記述と「永続化失敗をmatch_resultで救済」という不可能な旧記述を訂正 |
| 2026-07-30 | **W-08コア実装**: `shared/ws/lobby.ts`、`backend/src/lobby/`、共通`ws/connection.ts`、`/ws/lobby`、Vite `/ws` proxyを実装。`npm run check:lobby`でFIFO/3成立経路/rollback/LobbyRoom/grace/presence/実WS/heartbeat/session索引を検査。本Cookie認証・DB profile・logoutからのhook呼出しはW-04/W-05結合待ち |
