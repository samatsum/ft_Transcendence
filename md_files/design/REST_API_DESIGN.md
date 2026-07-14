# REST_API_DESIGN — REST API / データベース詳細設計書（③）

**位置づけ**: [ARCHITECTURE_DESIGN.md](./ARCHITECTURE_DESIGN.md) §2.4・§3.3 の詳細化。[WS_PROTOCOL_DESIGN.md](./WS_PROTOCOL_DESIGN.md)（②）が REST へ委ねた3点（presence 初期一覧 / `GET /api/maps` / 試合詳細）の定義を含む。弐（Backend/DevOps）の Day 2〜3（認証）と Day 8〜10（履歴・統計・フレンド）の作業指示書に相当し、参（Frontend）の API 契約の正本を兼ねる。
**原則**: 本書は実装コードを含まない。メッセージスキーマの実装正本は `shared/api/` の zod 定義とし、本書と乖離した場合は本書を改訂してから実装する（② と同じ運用）。

---

## 0. 前提と今回確定した決定

| # | 論点 | 決定 | 理由 |
|---|---|---|---|
| D-4 | セッション方式 | **opaque セッショントークン（DB `Session` 行）+ httpOnly Cookie**。JWT 不採用 | ② §7 の再接続本人確認・ログアウト即時失効に DB 照会が必要で、ステートレスの利点が無い。トークンハッシュのみ DB 保存 |
| D-5 | Cookie 属性 | `HttpOnly; Secure; SameSite=Lax; Path=/`。**TTL 7日・アクセスでスライディング延長** | 評価期間中の再ログイン要求を実質ゼロに。Secure は nginx TLS 終端（A1）前提 |
| D-6 | CSRF 対策 | **SameSite=Lax + 変更系メソッド（POST/PATCH/PUT/DELETE）の Origin ヘッダ検証** | ② §1 の WS Origin 検査と同方式に統一。CSRF トークンは導入しない（二重の仕組みを作らない） |
| D-7 | RefreshToken | **作らない**（ARCHITECTURE §3.3 の「Session / RefreshToken」は `Session` に一本化。本書が §3.3 を改訂） | D-5 のスライディングで十分。② §7 の「二重のトークン系を作らない」判断と同じ |
| D-8 | メール確認・パスワードリセット | **実装しない** | subject 非要求。README の制限事項に明記する |
| D-9 | JSON 命名 | **ワイヤは snake_case**（② の WS ペイロードと統一）。DB/TS 内部は camelCase | FE/BE 共有 zod スキーマの層で変換を吸収 |
| D-10 | ID | 全テーブル整数 autoincrement。URL パスの `:id` も整数 | SQLite で最も単純。推測可能性はアクセス制御で担保（公開情報しか返さない） |

API prefix は `/api`。バージョニングは行わない。公開 API モジュール（API キー・レート制限文書化）は**選定していない**ため、本 API は自 SPA 専用の内部 API である。

---

## 1. 共通規約

### 1-A. エラーエンベロープ

失敗レスポンスは全エンドポイント共通で以下の形とする。`code` は ② §2-C と同じ機械可読 snake_case 空間を使う。

```
{ "error": { "code": "validation_failed", "msg": "human readable", "details": { "field": "reason" } } }
```

| HTTP | code 例 | 用途 |
|---|---|---|
| 400 | `validation_failed` | zod 検証エラー（`details` にフィールド別理由） |
| 401 | `unauthenticated` | セッション無効・未ログイン |
| 403 | `forbidden` | 他人のリソースへの変更系アクセス |
| 404 | `not_found` | リソース不存在 |
| 409 | `conflict` / `email_taken` / `name_taken` / `already_friends` | 一意制約・状態競合 |
| 413 | `payload_too_large` | アバターサイズ超過 |
| 415 | `unsupported_media_type` | アバター形式不正 |
| 429 | `rate_limited` | §1-C |

### 1-B. バリデーション

全ボディ・クエリは `shared/api/` の zod スキーマで FE/BE 双方が検証する（必須要件「フロント/バック双方での検証」の REST 側の証拠。WS 側は ② §8）。サーバはさらに意味検証（一意性・権限・状態）を行う。

| フィールド | 規則 |
|---|---|
| `email` | RFC 形式・最大 254 文字・小文字化して一意 |
| `password` | 8〜128 文字。複雑性要件は課さない（長さ優先。argon2id 前提） |
| `display_name` | 3〜20 文字、`[a-zA-Z0-9_-]` のみ、大文字小文字を区別せず一意 |
| ページネーション | `?page=1&per=20`（`per` 上限 50）。レスポンスは `{ items, page, per, total }` |

`display_name` の文字集合制限は XSS 攻撃面の縮小を兼ねる（ARCHITECTURE §9.1 の攻撃バッテリー対象）。

### 1-C. レート制限（IP + セッション単位）

| 対象 | 上限 | 超過時 |
|---|---|---|
| `POST /api/auth/login` / `signup` | 5 回/分/IP | 429（ブルートフォース対策） |
| `PUT /api/users/me/avatar` | 3 回/分 | 429 |
| その他の変更系 | 30 回/分 | 429 |
| GET 系 | 120 回/分 | 429 |

---

## 2. エンドポイント一覧

### 2-A. 認証（`/api/auth`）— Day 2〜3

| Method / Path | 認証 | リクエスト | レスポンス |
|---|---|---|---|
| `POST /api/auth/signup` | 不要 | `email`, `password`, `display_name` | 201 + self + `Set-Cookie`（登録と同時にログイン） |
| `POST /api/auth/login` | 不要 | `email`, `password` | 200 + self + `Set-Cookie` |
| `POST /api/auth/logout` | 要 | — | 204。`Session` 行削除 + Cookie 破棄 |
| `GET /api/auth/me` | 要 | — | 200 self（SPA 起動時のセッション確認） |

- self = `{ id, email, display_name, avatar_url, created_at }`。**email を返すのは self のみ**（他人のプロフィールには含めない）。
- ログイン失敗は email 不存在・パスワード不一致を区別せず同一メッセージ（列挙攻撃対策）。
- パスワードは argon2id（memory 19MiB / iterations 2 / parallelism 1 = OWASP 推奨線）。評価で「ハッシュ+ソルト」の説明を求められる箇所（§9.1）。

### 2-B. ユーザー（`/api/users`）— Day 10

| Method / Path | 認証 | 内容 |
|---|---|---|
| `GET /api/users/:id` | 要 | 公開プロフィール: `{ id, display_name, avatar_url, created_at, last_seen_at, stats_summary }`。`stats_summary` は §2-D の集計の要約（モード別 played/win_rate） |
| `PATCH /api/users/me` | 要 | `display_name?`, `new_password?`（`new_password` 指定時は `current_password` 必須） |
| `PUT /api/users/me/avatar` | 要 | multipart 1 ファイル。**≤ 2MB、png/jpeg/webp、マジックバイト検証**（Content-Type は信用しない）。保存名はサーバ生成 `<userId>.<ext>`（上書き）。保存先はボリューム `/data/avatars`、配信は nginx 静的 `/avatars/<file>` |

- アバターのファイル名・拡張子をユーザー入力から採らないことで、パストラバーサル・XSS-via-filename を根絶する（§9.1 対象）。
- 画像の再エンコード・リサイズは行わない（2週間スコープ外。サイズ上限のみで防御し、制限として README に記載）。

### 2-C. フレンド（`/api/friends`）— Day 10

Standard user management モジュール（コア #6）の「フレンド追加とオンライン状態確認」の実体。**presence の初期一覧はここが返し、以後の差分はロビー WS `presence_update`**（② §3 との分担）。

| Method / Path | 内容 |
|---|---|
| `GET /api/friends` | `{ friends: [{ user, status }], sent: [request], received: [request] }`。`status` はロビー WS 接続表から合成した `online\|in_queue\|in_game\|offline` |
| `POST /api/friends/requests` | `display_name` 指定で申請。自分自身・既存関係（双方向チェック）は 409 |
| `POST /api/friends/requests/:id/accept` | 受信者のみ。`status` を accepted へ |
| `DELETE /api/friends/requests/:id` | 送信者=取消 / 受信者=拒否（行削除） |
| `DELETE /api/friends/:userId` | フレンド解除（行削除） |

- 申請のリアルタイム通知は行わない（ロビー画面の再取得で反映）。presence のみ WS でライブ更新する、という**意図的な簡略化**。

### 2-D. 試合・統計（`/api/matches`, `/api/users/:id/stats`）— Day 8〜9

ゲーム統計と対戦履歴モジュール（コア #8）の実体。② §6-C の `match_end.match_id` → 結果画面が `GET /api/matches/:id` を叩く経路。

| Method / Path | 内容 |
|---|---|
| `GET /api/matches?user_id=&mode=&page=` | 履歴（ページネーション、`ended_at` 降順）。`user_id` 省略時は全体フィード |
| `GET /api/matches/:id` | `{ id, mode, map_id, rules, started_at, ended_at, end_reason, winner_team, winner_user_id, players: [{ user_id, display_name, is_ai, team, slot, points_scored, result }] }`。AI 席は `user_id: null, display_name: "AI"` |
| `GET /api/users/:id/stats` | `{ per_mode: { rsp: { played, wins, losses, draws, abandons, win_rate }, fps: {...} }, total: {...} }` |

**統計の導出規約**（テーブルは増やさず `Match`/`MatchPlayer` の集計クエリで導出。ARCHITECTURE §3.3 どおり）:

- `win_rate = wins / (wins + losses + abandons)`。**abandon は分母に含める**（途中離脱を無かったことにしない。② §6-C の帰属規約とセット）。draw は分母から除外。
- `isAi = true` の行は個人統計の対象外（試合詳細の表示にのみ使う）。

### 2-E. マップ（`/api/maps`）— Day 8

② §4-B の `rules.map` が参照する ID 空間の正本。

| Method / Path | 内容 |
|---|---|
| `GET /api/maps?mode=` | `[{ id, name, mode, description }]` |

- マップはサーバ内蔵の**静的ホワイトリスト**（コード内の対応表 `{id, name, mode, path}`）とする。ユーザーアップロードは無い。G-09 のマップ制作はこの表への追記で公開される。
- `id` は `.cub` のファイル stem（例 `rsp_arena_1`）。GameRoom 生成時にサーバがこの表でパスを解決し、`welcome.map_text` として配布する（② §5-B。**クライアントがマップを REST で取ることはない**）。

---

## 3. Prisma スキーマ詳細（ER 図の正本）

ARCHITECTURE §3.3 の概念設計を実装可能な粒度に確定する。README の Database Schema 章と ER 図はこの表から生成する。

### `User`

| カラム | 型 | 制約 |
|---|---|---|
| id | Int | PK, autoincrement |
| email | String | unique（小文字で保存） |
| passwordHash | String | argon2id 文字列 |
| displayName | String | unique（照合は小文字化した一意インデックス） |
| avatarPath | String? | `/data/avatars` 配下の相対名 |
| createdAt | DateTime | default(now) |
| lastSeenAt | DateTime? | 認証済みリクエスト・WS 切断時に更新 |

### `Session`

| カラム | 型 | 制約 |
|---|---|---|
| id | Int | PK |
| userId | Int | FK → User, index |
| tokenHash | String | unique（**生トークンは保存しない**。SHA-256） |
| createdAt / expiresAt | DateTime | スライディング延長時は expiresAt を更新 |

### `Friendship`

| カラム | 型 | 制約 |
|---|---|---|
| id | Int | PK |
| requesterId / addresseeId | Int | FK → User。`@@unique([requesterId, addresseeId])`。**逆向きの既存関係はアプリ層で検査**（Prisma に CHECK が無いため） |
| status | String | `pending` / `accepted` |
| createdAt | DateTime | |

### `Match`

| カラム | 型 | 制約 |
|---|---|---|
| id | Int | PK |
| mode | String | `rsp` / `fps` |
| mapId | String | §2-E の ID |
| settingsJson | String | ② §4-B の rules をそのまま JSON 保存 |
| startedAt / endedAt | DateTime / DateTime? | |
| winnerTeam | Int? | RSP: 0/1。FPS・打ち切りは null |
| winnerUserId | Int? | FPS: 勝者。RSP は null |
| endReason | String? | `score` / `goal` / `forfeit` / `abandon`（② §5-D と同一空間） |

### `MatchPlayer`

| カラム | 型 | 制約 |
|---|---|---|
| id | Int | PK |
| matchId | Int | FK → Match, index |
| userId | Int? | FK → User, index。**null = AI 席**（行として残す。統計整合のため） |
| isAi | Boolean | |
| team / slot | Int | `@@unique([matchId, slot])` |
| pointsScored | Int | |
| result | String | `win` / `lose` / `draw` / `abandon`（帰属規約は ② §6-C） |

（保2 OAuth 採用時のみ `OAuthAccount { provider, providerUserId, userId }` を追加。コアでは作らない。）

---

## 4. セキュリティ・評価対応（§9.1 の REST 側担保）

| 評価シートの検査 | 本設計での担保 |
|---|---|
| パスワードのハッシュ+ソルト | argon2id（ソルト内蔵）。§2-A のパラメータを口頭説明できるようにする |
| SQLi 実地テスト | Prisma（プリペアド相当）。生 SQL は統計集計でも使わない（Prisma の groupBy/aggregate で書く） |
| XSS 実地テスト | React エスケープ + `display_name` 文字集合制限 + アバターのサーバ生成ファイル名 |
| 不正入力 | zod 二重検証（§1-B）+ 429/413/415 の境界テスト |
| 秘密情報ゼロ | 生セッショントークン・パスワードはログ出力禁止（pino の redact 設定）。`.env` は W-15 の `env.example` 運用 |

---

## 5. ②・①との整合チェックリスト

| 参照元の要求 | 本書での担保 |
|---|---|
| ② §3-B「presence 初期一覧は REST」 | `GET /api/friends` の `status` 合成（§2-C） |
| ② §4-B「`GET /api/maps`（③で定義）」 | §2-E |
| ② §6-C「結果画面の詳細は REST」 | `GET /api/matches/:id`（§2-D） |
| ② §6-C の result 帰属規約 | `MatchPlayer.result` の値空間・abandon 分母算入（§2-D） |
| ② §1「トークンを URL に載せない」 | Cookie のみ。トークンはハッシュ保存（§3 Session） |
| ② §5-E ルーム一覧 API（保1） | **未定義のまま**とする。保1 着手時に `GET /api/rooms` を本書へ追記 |
| ARCHITECTURE §3.3 | Session 一本化（D-7）以外は概念設計どおりに詳細化 |
