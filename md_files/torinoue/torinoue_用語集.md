# torinoue 用語集（自分専用）

> **読者**: torinoue 本人  
> **目的**: 設計書に出てくる言葉を、実装・PM の議論で使える状態にする  
> **状態**: 学習用。用語の正本は各設計書  
> **作成**: 2026-07-26（AI 草案 → 本人レビュー前提）  
> **更新**: 2026-07-26 — REST/ゲート/境界語の詳細項、Issue 接頭辞の想定展開、丸数字と説n の分離

関連: [読む順（実装）](./torinoue_読む順_実装.md) / [読む順（PM）](./torinoue_読む順_PM.md)

**読み方**: §1〜§4 は一覧。深い説明は [§7 詳細](#7-詳細説明チャット知見の粒度) へ。表の「→ 詳細」から飛べる。

**丸数字の意味（本書）**: **⓪①②③④⑤⑥ = 設計書**（[ドキュメント地図 §4](../ドキュメント地図(最初にこれ嫁).md)）。  
`説明用/` の読む順は **説1〜説12**（丸数字を使わない）。  
リンク方針: 表や初出では設計書へリンクし、繰り返しは素の「③」等でも可（常に設計書を指す）。

---

## 1. 契約まわり（最優先）

| 用語 | 一言 | 当プロジェクトでの実体 |
|---|---|---|
| **契約（contract）** | 「向こうがこう呼べば、こっちはこう返す」という合意。コードの前に文書と型で固定する | REST なら [③ REST_API設計](../02_設計書/3-REST_API設計.md)。WS なら [② WSプロトコル設計](../02_設計書/2-WSプロトコル設計.md) |
| **[REST](#71-restrepresentational-state-transfer) 契約** | HTTP の URL・メソッド・リクエスト/レスポンス形・エラー形・認証の要否を固定したもの | ③ の §1〜§2。実装は `app/backend` + `app/shared` |
| **[SSOT](#72-ssotsingle-source-of-truth)（Single Source of Truth）** | 「迷ったらここを正とする」場所を1つに決めること | 進捗 → [⑤ バックログ](../02_設計書/5-バックログ.md)。REST 形 → [③ REST_API設計](../02_設計書/3-REST_API設計.md)。型の実装 → `app/shared` の zod |
| **インターフェース** | 担当同士が渡す境界。中身の実装は自由、境界の形は固定 | IRC では `complete line` / `CommandResult`。当プロジェクトでは REST JSON・WS メッセージ・Cookie |
| **[zod](#714-fastify--pino--zod)** | TypeScript で「この JSON はこの形」と実行時に検査するライブラリ | `app/shared/src/*.ts`。FE も BE も同じ定義を import する |
| **[エラーエンベロープ](#713-cookie--エラーエンベロープ--snapshot)** | 失敗時に必ず返す共通の JSON 入れ物 | `{ "error": { "code", "msg", "details?" } }`（③ §1-A）。骨格は `app/shared/src/error.ts` |

**「[REST](#71-restrepresentational-state-transfer) 契約を所有する」の意味（担当1）**  
[③ REST_API設計](../02_設計書/3-REST_API設計.md) と `app/shared` の形を変える権限と責任があなたにある。変えるときは設計書を先に直し、担当3（[FE](#73-fefrontend--fe-基盤)）と合意してから実装する（[⑥ チーム分担計画](../02_設計書/6-チーム分担計画.md) §7）。  
（→ REST 本体の説明: [§7.1](#71-restrepresentational-state-transfer)）

---

## 2. 認証・セキュリティ

| 用語 | 一言 | 設計上の決定 |
|---|---|---|
| **[セッション / Session](#76-sessionセッション)** | 「このブラウザは user X としてログイン中」というサーバ側の記録 | DB の `Session` 行 + Cookie（③ D-4）。JWT は使わない |
| **[httpOnly Cookie](#713-cookie--エラーエンベロープ--snapshot)** | JavaScript から読めない Cookie。XSS でトークンを盗まれにくくする | `HttpOnly; Secure; SameSite=Lax; Path=/`（③ D-5） |
| **opaque トークン** | 中身に意味がない乱数。サーバが DB で照合する | Cookie の値そのものを信用せず、ハッシュを DB 照会 |
| **Origin 検証** | ブラウザが付ける `Origin` ヘッダを見て、自サイト以外からの変更を拒否 | REST 変更系 + WS アップグレード（③ D-6 / ②）。担当1 の W-05 |
| **[CSRF](#712-csrf--csrf-over-ws) / CSRF-over-WS** | 他サイト経由の不正操作。WS 版はアップグレード経路 | 対策は Origin + SameSite（②③）。深い理論は必須ではない → [§7.12](#712-csrf--csrf-over-ws) |
| **argon2id** | パスワードを保存用にハッシュする方式 | signup/login で使う（W-04） |
| **認可（authorization）** | 「その人がその操作をしてよいか」 | Cookie で本人確認したあと、他人の資源なら 403 |

---

## 3. アーキテクチャ部品

| 用語 | 一言 | 場所 / 詳細 |
|---|---|---|
| **[REST](#71-restrepresentational-state-transfer)** | HTTP で1回ずつ JSON をやりとりする API の呼び方 | 担当1。正本③。実装 `app/backend` → [§7.1](#71-restrepresentational-state-transfer) |
| **[WS](#711-wswebsocket)（WebSocket）** | 双方向の常時接続 | 担当2 本丸。担当1 は Cookie/Origin → [§7.11](#711-wswebsocket) |
| **[FE](#73-fefrontend--fe-基盤) / FE 基盤** | ブラウザ側 SPA。基盤は認証・ロビー等（非ゲーム画面） | 担当3（mamiyaza）→ [§7.3](#73-fefrontend--fe-基盤) |
| **[ロビー](#74-ロビー--ロビー系)** | 試合前の待合・マッチング画面／その系統 | F-05 / W-08 → [§7.4](#74-ロビー--ロビー系) |
| **[Fastify](#714-fastify--pino--zod)** | Node.js の HTTP サーバ枠 | `app/backend`。W-01 起動済、W-02 本装 → [§7.14](#714-fastify--pino--zod) |
| **[pino](#714-fastify--pino--zod)** | Fastify 既定に近い高速 JSON ロガー | W-02 で本設定 → [§7.14](#714-fastify--pino--zod) |
| **[zod](#714-fastify--pino--zod)** | 実行時スキーマ検証 | `app/shared` → [§7.14](#714-fastify--pino--zod) |
| **[Prisma](#715-prisma--sqlite)** | TS から DB を扱う ORM | W-03。正本③ §3 → [§7.15](#715-prisma--sqlite) |
| **[SQLite](#715-prisma--sqlite)** | ファイル1個の DB | 評価は単一ホスト前提 → [§7.15](#715-prisma--sqlite) |
| **[WASM](#78-wasmwebassembly) / sim.wasm** | C をブラウザ/Node で動かす成果物。sim は判定権威 | 担当2 が Node で駆動 → [§7.8](#78-wasmwebassembly) |
| **サーバ権威** | クライアント申告を信じずサーバ状態を正とする | スナップショット配信の前提（[説4 スナップショットと補間](../説明用/スナップショットと補間.md)） |
| **[snapshot](#713-cookie--エラーエンベロープ--snapshot)** | ある瞬間のゲーム状態の写真 | ②§5-C。F-06 が補間描画 → [§7.13](#713-cookie--エラーエンベロープ--snapshot) |
| **[TL](#77-tltechnical-lead)** | テクニカルリード | samatsum → [§7.7](#77-tltechnical-lead) |
| **nginx** | HTTPS 終端と `/api` `/ws` の取り次ぎ | W-15。現状 `infra/` は骨格のみ |
| **モノレポ / workspaces** | 1リポジトリに FE/BE/shared を同居 | ルート `package.json` → `app/*` |

---

## 4. 課題・工程の略号

### 4-A. Issue 接頭辞（想定展開・PR で要確認）

⑤ バックログはレーン名を英語で書くが、**接頭辞1文字の正式な英単語展開は本文に無い**。  
下表の「想定元単語」は読み替え用の提案。妥当性はコミット後の PR レビューで確認する。

| 接頭辞 | 文書上のレーン（⑤） | 想定元単語 | 備考 |
|---|---|---|---|
| **E-xx** | Engine（壱） | **Engine** | 完了済。ほぼ確定と読んでよい |
| **G-xx** | Gameplay（肆） | **Gameplay** | 完了済。ほぼ確定と読んでよい |
| **W-xx** | Backend / DevOps（弐） | 候補 **Web**（または Backend の便宜的接頭辞） | 文書は「Backend/DevOps」としか書いていない。W≠Frontend |
| **F-xx** | Frontend（参） | **Frontend** | ほぼ確定と読んでよい |
| **H-xx** | ハードニング（⑤ゲート表） | 候補 **Hardening** | Day12 相当。出現は少ない |

あなた中心の W: W-02〜W-05, W-15, W-13…（認証・DB・Docker・永続化）。

### 4-B. その他の略号

| 略号 | 意味 |
|---|---|
| **[ゲート](#79-ゲート--ゲート1--ゲート2--ゲート3)** / **ゲート2** | 結合デモの品質関門。ゲート2 = 2ブラウザで 2vs2 RSP が最後まで遊べる（現行判定は Day3 終わり）→ [§7.9](#79-ゲート--ゲート1--ゲート2--ゲート3) |
| **壱弐参肆** | 旧レーン名。弐 = Backend（あなた）, 参 = Frontend |
| **⓪〜⑥** | **設計書番号**（丸数字専用）。⓪全体 / ①エンジン / ②WS / ③REST / ④FE設計 / ⑤バックログ / ⑥分担。主に触るのは **③** と **⑤** |
| **説1〜説12** | **説明用**の読む順（設計書の丸数字とは別）。地図の説明用表を正とする |
| **[PM](#710-pm--sm) / [SM](#710-pm--sm)** | Project Manager / Scrum Master。あなた（README・⑥） |
| **[TL](#77-tltechnical-lead)** | Technical Lead = samatsum |
| **RSP** | このゲームのじゃんけん鬼ごっこモード（Rock-Paper-Scissors 系）。ゲート2 の題材 |

---

## 5. IRC 時代との対応（感覚用）

| IRC | 当プロジェクト |
|---|---|
| `interface.md`（境界の憲章） | ② WS + ③ REST + ⑥ §4 共有契約 |
| `complete line` / `CommandResult` | HTTP JSON / WS メッセージ / Cookie |
| A層（Network）のあなた | 担当1（Auth/REST/DB）+ PM。ネットワーク本丸は担当2 |
| 層間 SSOT を先に固める文化 | 設計書は厚いが、**4人並行用の「境界ペラ1枚」が薄い**（弱点分析参照） |
| Phase / 結合合格基準 | [ゲート](#79-ゲート--ゲート1--ゲート2--ゲート3)（少数の大きな品質関門） |

---

## 6. まだ覚えなくてよいこと（2時間スコープ外）

- Prisma の高度なリレーション最適化
- nginx の詳細チューニング
- C エンジン内部・DDA・敵 AI
- 観戦・フレンド・アバター（ゲート2 後／切り捨て候補）
- CSRF の学術的な分類・攻撃デモの自作（対策方針を守ればよい → [§7.12](#712-csrf--csrf-over-ws)）

---

## 7. 詳細説明（チャット知見の粒度）

### 7.1 REST（REpresentational State Transfer）

**略称**: Representational State Transfer（表象的状態転送）。Roy Fielding の博士論文で定義された Web 向けアーキテクチャスタイルの名前。

**一言**: ブラウザ等がサーバへ **HTTP で1回ずつ**頼み、**URL** で資源を指し、**メソッド**（GET/POST 等）で操作を表し、多くは **JSON** で返すやり方。

**WS との対比**

| | REST | WS（WebSocket） |
|---|---|---|
| 接続 | リクエストごとに短い | 張りっぱなし |
| 向き | 主にクライアント→サーバ→応答 | 双方向をサーバからもプッシュ |
| このプロジェクト | ログイン・プロフィール・履歴など | ロビー presence・試合 snapshot/input |
| 所有者 | **担当1（あなた）** | **担当2（samatsum）** |

**当プロジェクトでの実体**

- 契約の正本: [③ REST_API設計](../02_設計書/3-REST_API設計.md)
- 実装: `app/backend`（Fastify）+ 型は `app/shared`（zod）
- 例: `POST /api/auth/login`、失敗時はエラーエンベロープ
- 「REST 契約を所有する」= ③ と shared の形を変える責任（§1 参照）

---

### 7.2 SSOT（Single Source of Truth）

**略称**: Single Source of Truth。

**一言**: 同じ事実について「正」を複数持たず、迷ったら参照する場所を1つに決めること。

**当プロジェクトでの実体**

| 何の正か | どこか |
|---|---|
| 進捗・Issue 受入 | ⑤ バックログ |
| REST の形（文書） | ③ |
| WS メッセージ | ② |
| 日程（5日） | ⑥ §5.1（⓪ の14日表は無効） |

---

### 7.3 FE（Frontend） / FE 基盤

**略称**: Frontend（フロントエンド）。

**一言**: ユーザが触るブラウザ側の画面とクライアントロジック。

**FE 基盤（このプロジェクトの言い方）**: ゲーム Canvas 以外の土台 — 認証画面、ロビー、プロフィール、fetch ラッパ、ルートガードなど。担当3（mamiyaza）のレーン。担当4（hminemur）の GameView と対になる。

**当プロジェクトでの実体**: `app/frontend`。F-01〜F-05 が基盤側、F-06〜がゲーム画面側。

---

### 7.4 ロビー / ロビー系

**一言（一般）**: 試合や部屋に入る前の待合空間。

**当プロジェクト**

- **ロビー（画面）**: 設計書④（フロントエンド設計）のロビー一式。オンライン一覧・キュー・ルームなど（F-05）
- **ロビー系（依存の束）**: 人がログインしたあとに試合へ進む経路全体。例: W-04（auth）→ W-08（ロビー WS）→ F-05 → マッチ成立。IRC比較や PERT で「ロビー系が止まる」と言うときはこの束を指す

---

### 7.5 BE（Backend）※参考

**略称**: Backend。文書レーン名は Backend / DevOps。Issue 接頭辞は W（[§4-A](#4-a-issue-接頭辞想定展開pr-で要確認)）。

**一言**: サーバ側。REST・DB・（同じ Node 上の）WS/GameRoom 置き場が `app/backend`。

---

### 7.6 Session（セッション）

**一言（一般）**: 「この接続／このブラウザは誰としてログイン中か」をサーバが覚える仕組み。

**当プロジェクト（③ D-4）**

- JWT は使わない
- DB の `Session` 行 + **httpOnly Cookie** に opaque トークン
- ログアウトで行削除 → 即時失効
- WS も同じ Cookie で本人確認（②）

IRC比較文の「Session/REST」は、TCP バッファの代わりに **このログイン状態が下支えの中身になった**、という意味。

---

### 7.7 TL（Technical Lead）

**略称**: Technical Lead（テクニカルリード）。

**一言**: 技術方針と重要境界の最終判断を持つ役割。

**当プロジェクト**: **samatsum**（README / ⑥）。sim / WS プロトコル境界のレビュー。あなたは PM/SM であり TL ではない。

---

### 7.8 WASM（WebAssembly）

**略称**: WebAssembly。

**一言**: C などをブラウザや Node で速く動かすためのバイナリ形式。

**当プロジェクト**: `render.wasm`（描画）と `sim.wasm`（サーバ側判定）。勝敗の権威は sim。担当2 が Node で回す（W-10）。

---

### 7.9 ゲート / ゲート1 / ゲート2 / ゲート3

**一言**: 個別 Issue の完了ではなく、**結合デモが成立するか**を go/no-go で見る品質関門（quality gate / stage-gate に近い）。0〜9 の連番ではない。

| ゲート | 判定 | 状態（精査時点） |
|---|---|---|
| **ゲート1** | 静的マップの Canvas 描画 | ✅ 通過 |
| **ゲート2** | 2ブラウザで 2vs2 RSP が最後まで遊べる | 未。現行日程では Day3 終わり判定（⑥）。⑤の Day7 は旧14日表 |
| **ゲート3** | コア 14pt が結合環境で全動作 | 未 |
| Day12 ハードニング | 拒否条件・提出（ゲート番号なし） | 未 |

一般用語との関係・IRC の Phase との対応の長文はチャット回答を正とし、ここでは PM 用に上表で足りる。失敗時は ⓪ にフォールバック規定あり。

---

### 7.10 PM / SM

**略称**: Project Manager / Scrum Master。

**一言**: 進捗・期限・ブロッカー・定例。技術最終決定は TL。

**当プロジェクト**: あなた（torinoue）。詳細は [読む順_PM](./torinoue_読む順_PM.md)。

---

### 7.11 WS（WebSocket）

**略称**: WebSocket。

**一言**: TCP 上でブラウザとサーバが**常時双方向**にメッセージを送り合う仕組み。

**REST との対比**: [§7.1](#71-restrepresentational-state-transfer) の表。

**当プロジェクト**: 契約正本は ②。ロビー WS（W-08）とゲーム WS（W-11）が本丸で担当2。あなたは Cookie 検証と Origin（W-04/W-05）で入口を閉じる。

---

### 7.12 CSRF / CSRF-over-WS

**略称**: Cross-Site Request Forgery（クロスサイトリクエストフォージェリ）。

**一言（一般）**: ユーザがログイン中のサイトへ、**別サイト経由で勝手に操作を送らせる**攻撃。

**CSRF-over-WS**: 同じ発想を WebSocket の接続開始（アップグレード）に載せたもの。別 Origin から WS を張られると、Cookie が付いて「本人の接続」に見える危険がある。

**torinoue が知るべき範囲**

| 知る | 深く知らなくてよい |
|---|---|
| 対策は **SameSite=Lax Cookie + 変更系/WS の Origin 検証**（③ D-6 / ②） | 攻撃の自作・分類学・CSRF トークン方式の比較 |
| W-05 で Origin を実装する | 「CSRF-over-WS」という用語の語源論争 |

**結論**: 用語として②に出てくるので意味の輪郭は知る。**理論の専門家になる必要はない**。W-05 の受入（異 Origin を拒否）を満たせば足りる。

---

### 7.13 Cookie / エラーエンベロープ / snapshot

#### Cookie

| | 一般 | 当プロジェクト |
|---|---|---|
| 意味 | ブラウザがサーバから預かり、以降のリクエストに付ける小さなデータ | **セッション用 httpOnly Cookie のみ**（トラッキングしない。Privacy 文面もその前提） |
| 役割 | 状態の持ち回り | opaque トークンを載せ、DB `Session` と照合 |

#### エラーエンベロープ

| | 一般 | 当プロジェクト |
|---|---|---|
| 意味 | 失敗レスポンスを共通の入れ物に包む習慣 | ③ §1-A 固定形 `{ "error": { "code", "msg", "details?" } }` |
| 役割 | FE が分岐しやすい | REST/WS で `code` 語彙を共有。`app/shared/src/error.ts` |

#### snapshot（スナップショット）

| | 一般 | 当プロジェクト |
|---|---|---|
| 意味 | ある時点の状態の複製・写真 | サーバ権威のゲーム状態を JSON で配信するメッセージ（② §5-C） |
| 役割 | バックアップ等でも使う語 | FE は補間描画（F-06）。勝敗判定はクライアントに無い |

境界オブジェクトとして名前で呼ぶ、という IRC 習慣の移植先がこの3つ（+ Cookie）。

---

### 7.14 Fastify / pino / zod

| 用語 | 何か | 当プロジェクト |
|---|---|---|
| **Fastify** | Node.js 用の高速 HTTP フレームワーク（Express より現代的・スキーマ親和） | `app/backend`。W-01 で起動骨格。W-02 で検証・レート制限等 |
| **pino** | JSON 行の高速ロガー。Fastify と組み合わせ定番 | W-02 で本格設定（開発中は既定ログ） |
| **zod** | TS のスキーマ宣言＋実行時 parse | FE/BE 共有が要件。`app/shared`。W-02 でパイプライン化 |

W-02 の一文「Fastify 起動（pino・zod 検証・③§1…）」= サーバ枠を整え、ログと入力検証とエラー形を③どおりにする、という意味。

---

### 7.15 Prisma / SQLite

| 用語 | 何か | 当プロジェクト |
|---|---|---|
| **Prisma** | TypeScript 向け ORM。`schema.prisma` が表定義のコード寄りの正 | W-03 で導入。5テーブルは ③ §3（User/Session/Friendship/Match/MatchPlayer） |
| **SQLite** | サーバプロセス無し、ファイル1つで動く DB | 評価がローカル単一ホストのため採用（⓪）。Postgres より運用が軽い |

W-03 = この2つでスキーマ v1 とマイグレーションを用意し、のちの compose 初回起動に載せる。
