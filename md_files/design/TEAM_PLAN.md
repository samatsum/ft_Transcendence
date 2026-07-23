# TEAM_PLAN — 4人体制の作業分担（完了済み + 残作業）

**位置づけ**: これまで全工程を1人で進めてきたが、ここから4人体制へ移行する。本書は「完了済み（壱=Engine / 肆=Gameplay）」と「残作業（弐=Backend / 参=Frontend）」を一望し、残りを **4人が並行で進められるよう役割に割る**ための正本。
個々の Issue の受入条件・依存は [BACKLOG.md](./BACKLOG.md) が正本。本書は**分担・依存の同期点・引き継ぎ資産・並行作業ルール**に集中する。

作成日: 2026-07-19（main `cd40b55` 時点）

---

## 0. 全体像（なぜこの割り方になるか）

元の設計は **4レーン = 4人**（壱=Engine / 弐=Backend/DevOps / 参=Frontend / 肆=Gameplay）を想定していた。それを1人で全部やってきた結果:

- **C エンジン側の2レーン（壱 E-01〜E-14 / 肆 G-01〜G-10）は完了**。native/web/sim の3ターゲット、sim 公開 API、snapshot 受け口、対戦マップ4枚、CI、受入テスト（`make test` 85検査）まで揃っている。
- **残るは TypeScript の2レーン（弐 W-01〜W-16 / 参 F-01〜F-12）だけ**。

そこで **残る2レーンをそれぞれ2人に割り、4人**とする。C の成果物は「4人が使う部品」として §2 に整理した。

> **重要**: 現在「遊べる」のは **1人 vs NPC** のみ。**対人戦（2ブラウザで 2vs2 RSP＝ゲート2）は、この残作業が初めて成立させる**。C 側は素材（複数席・入力源切替・snapshot 配信/受信）を用意し終えた段階。

---

## 1. 完了済み（壱・肆）— もう触らなくてよい

| レーン | 範囲 | 状態 | 参照 |
|---|---|---|---|
| 壱 Engine | E-01〜E-07（層分離・render.wasm・ゲート1） | ✅ | GATE1_REPORT |
| 壱 Engine | E-08〜E-12（web入力・memリーダ・sim API・sim.wasm・snapshot受け口） | ✅ | ENGINE_PHASE3_REPORT |
| 壱 Engine | E-13（描画ハードニング）/ E-14（CI） | ✅ | ENGINE_E13_E14_REPORT |
| 肆 Gameplay | G-01〜G-10（戦闘員統合・先取点・FPS 1vs1・敵ハザード・対戦マップ・BMP無効化） | ✅ | ENGINE_PHASE2/PHASE3_REPORT |

**残る C 側の宿題は2つだけ（人間確認。§6）**: G-09 マップのテストプレイ承認 / CI 初回 green（billing 解除待ち）。

---

## 2. 引き継ぎ資産（残作業が「使う」部品）

4人が新しく書く W/F は、下の**既にある部品へ配線するだけ**の箇所が多い。ここが一番の時短ポイント。

| 部品 | 実体 | 誰が使う | 使い方の正本 |
|---|---|---|---|
| **sim 公開 API** | `sim.wasm` + `codes/includes/platform/sim.h` | 担当2（W-10） | **ENGINE_PHASE3_REPORT §W-10 申し送り（9項目）**＝呼び出し順・席とチーム対応・id 照合・target_score・yaw 権威・1ルーム=1インスタンス |
| **snapshot レイアウト** | `platform/sim.h`（f64 フラット配列 header5+戦闘員9/体） | 担当2（配信）/ 担当4（受信） | 同上。`record.mjs` の `takeSnapshot()` が JSON 化の参照実装 |
| **クライアント描画** | `render.wasm` + `web_apply_snapshot(flat,len,view_id)` + `web_render_frame()` | 担当4（F-06） | ② §5-C。`web_init(map,is_rsp,w,h)` で内部解像度指定（E-13） |
| **補間** | `web/snapshot_interp.js`（位置=線形・角度=最短弧） | 担当4（F-06） | **F-06 はこれをそのまま流用**（④ §4 の壱担当分） |
| **一方通行デモ** | `web/sim_demo/record.mjs` → `replay.html/js` | 担当2/4 の参照実装 | 「sim → JSON → render」を W-10/W-11/F-06 がそのまま本番化 |
| **対戦マップ4枚** | `rsp` / `rsp_pillars` / `21x21_arena` / `fps_duel` | 担当2（W-14） | ③ §2-E ホワイトリスト表（`{id,name,mode,path}`） |
| **受入テスト/CI** | `make test`（sim 85検査）/ `.github/workflows/ci.yml` | 全員 | native/web/sim を壊す退行を毎 PR で検知。W-16 が FE 検査を追加 |
| **lint** | `make check`（13検査。layering 復旧済み） | 全員 | CR001〜015。common→モード依存も検知する |

---

## 3. 4人の役割

> 記号: 各担当の Issue は**依存順**に並べる。★=クリティカルパス（ゲート2 の芯）。
> **人選のヒント**: C エンジンを作った本人は、**担当2（sim.wasm を駆動する W-10 の唯一の適任者）**が自然。担当4（描画/snapshot 受信）とは §2 の資産で密結合するのでペアレビュー推奨。残り3名は新規参加でよい。

### 担当1 — バックエンド基盤（Auth / REST / DB / DevOps）

サーバーの「土台と正本データ」。REST 契約（③）と共有 zod スキーマの所有者。

| 順 | Issue | 一言 |
|---|---|---|
| 1 | **W-01** | リポジトリ骨格（`backend/ frontend/ shared/ infra/`・TS ツール）。**全員の着手ブロッカーなので最優先** |
| 2 | W-15 | Docker Compose + nginx TLS + 単一コマンド起動。**評価要件「空clone→`docker compose up`」の芯**。継続タスク |
| 3 | W-02 | Fastify 起動（pino・zod 検証・③§1 エラーエンベロープ/レート制限） |
| 4 | W-03 | Prisma + SQLite スキーマ v1（③§3 の5テーブル）+ マイグレーション |
| 5 | W-04 | 認証一式（signup/login/logout/me・argon2id・Session Cookie） |
| 6 | W-05 | Origin 検証（REST 変更系 + WS アップグレード）と Cookie 認可の共通化 |
| 7 | W-13 | 試合永続化 + `match_result` 配信 + 履歴/統計 API（**担当2 の決着イベントを受けて DB 行を書く**） |
| 8 | W-14 | `GET /api/maps` + `welcome.map_text` 経路（③§2-E のホワイトリストを転記） |
| 9 | W-06 / W-07 | アバターアップロード / フレンド API（Day 10 機能） |

- **所有する契約**: ③ REST の全エンドポイント、`shared/` の zod スキーマ（担当3 と共同編集）。
- **最初の一手**: W-01 を Day 1 に片付ける（他3人が待っている）。その足で W-15 の compose 骨格を立てる。

### 担当2 — ゲームサーバー（WS / GameRoom / sim.wasm 駆動）★

対人戦の心臓。**sim.wasm を Node 上で権威実行する唯一のレーン**。WS プロトコル（②）の所有者。

| 順 | Issue | 一言 |
|---|---|---|
| 1 | **★W-10** | GameRoom + `sim.wasm` 統合（30Hz tick・偶数 tick 配信・状態機械）。**依存 E-11 は完了済みなので Day 1 から着手可**。まず Node 単体で複数ルーム駆動を通す |
| 2 | ★W-08 | ロビー WS（presence/queue/room）。※auth（担当1 W-04）着地後に接続認可を差し込む |
| 3 | ★W-09 | マッチメイキング成立→GameRoom 生成→`match_found` |
| 4 | **★W-11** | ゲーム WS（join/input/leave/welcome/snapshot/event）。№5 snapshot<1KB / №6 不正メッセージ破棄 |
| 5 | ★W-12 | 切断/再接続/AI 代替（30秒猶予・`game_set_input_source`）。№4 |
| — | (W-13 連携) | 決着時に `match_end` を出し、永続化は担当1 へ渡す |

- **所有する契約**: ② WS プロトコル（§5 メッセージ・§6 GameRoom 状態機械）。**snapshot の JSON 形（②§5-C）を担当4 へ提示するのが最重要の同期点**。
- **最初の一手**: `record.mjs` を出発点に W-10 を組む（`sim_create → game_add_combatant × 定員 → 毎tick sim_set_input → game_step → game_snapshot → JSON化`）。ENGINE_PHASE3_REPORT §W-10 申し送りの9項目が実装手順書。

### 担当3 — フロント基盤（認証 / ロビー / プロフィール）

画面の土台と、ゲーム画面以外の全ページ。REST/ロビー WS の消費側。

| 順 | Issue | 一言 |
|---|---|---|
| 1 | **F-01** | 雛形（Vite/React/TS/Tailwind/Router/ErrorBoundary/StrictMode）。ビルド警告ゼロ |
| 2 | F-02 | fetch ラッパ + `shared` zod 接続（③§1 エラーエンベロープ・Toast） |
| 3 | F-03 | 認証画面 + ルートガード（担当1 W-04 と結合） |
| 4 | F-04 | 共通レイアウト + **Privacy/ToS 実文面**（プレースホルダー禁止） |
| 5 | ★F-05 | ロビー一式（5領域 + `useLobbySocket`）。**担当2 W-08・担当1 W-04 と結合** |
| 6 | F-09 | プロフィール/統計/履歴（担当1 W-13/W-06 と結合） |
| 7 | F-10 | フレンド UI（担当1 W-07 と結合） |
| 8 | F-11 | レスポンシブ + アクセシビリティ（375px・キーボードのみで対戦開始まで） |
| — | W-16 | CI に FE lint/型検査ジョブを追加（既存 `ci.yml` へ足すだけ） |
| — | (F-12 保1) | 観戦 UI。余力時のみ |

- **所有する契約**: ④ Frontend のうちゲーム画面以外。`shared/` zod を担当1 と共同編集。
- **最初の一手**: W-01 着地後すぐ F-01。F-02→F-03 は担当1 の W-02/W-04 と歩調を合わせる。

### 担当4 — フロントゲーム（GameView / HUD / 統合）★

対戦画面。**§2 の render.wasm / snapshot_interp.js をそのまま配線する**レーン。ゲート2 の統合役。

| 順 | Issue | 一言 |
|---|---|---|
| 1 | **★F-06** | GameView 統合（render.wasm ロード・Canvas・**補間受け口**・入力送信）。**担当2 W-11 と結合**。`replay.html` が下敷き |
| 2 | ★F-07 | HUD オーバーレイ一式（8要素。grace→AI 遷移表示） |
| 3 | ★F-08 | マッチ遷移フロー（match_found→countdown→match_end モーダル→ロビー）。遷移中の WS 張り替えでコンソールエラーゼロ |
| — | (F-12 保1) | 観戦 HUD |

- **所有する契約**: ゲーム画面の描画・入力送信。**② §5-C の補間契約（now-100ms の2snapshotで補間・自 yaw はローカル優先）を担当2 と突き合わせる**。
- **最初の一手**: 着手前に `web/sim_demo/replay.html` を動かして「補間→`web_apply_snapshot`→`web_render_frame`」の流れを体で覚える。F-06 は snapshots.json を **WS 受信バッファに差し替えるだけ**。

---

## 4. 共有契約（4人の境界＝ここだけ合意すれば並行できる）

並行作業が破綻しないための「継ぎ目」。**各契約に1人の所有者を置き、他は消費者**とする。

| 契約 | 所有 | 消費 | 正本 |
|---|---|---|---|
| `shared/` zod スキーマ（型の単一情報源） | 担当1（+担当3 共同） | 全員 | ③ §1 / ② のペイロード。W-01 で骨格を置く |
| REST API（③） | 担当1 | 担当3 | REST_API_DESIGN |
| WS プロトコル（②§5 メッセージ / §6 状態機械） | 担当2 | 担当4 | WS_PROTOCOL_DESIGN。**snapshot JSON 形が最重要** |
| sim 公開 API（① §3-B） | （完了・不変） | 担当2 | `platform/sim.h` + PHASE3_REPORT §W-10 |
| snapshot 受信/補間（`web_apply_snapshot`・`snapshot_interp.js`） | （完了・不変） | 担当4 | ② §5-C |

**最優先の同期**: 担当2⇄担当4 の「snapshot JSON 形と補間契約」。ここが噛み合えば 2vs2 RSP が画面に出る。次点は 担当1⇄担当3 の「REST エラーエンベロープと Cookie 認可」。

---

## 5. ゲート2までのクリティカルパス（4人の合流点）

ゲート2 = **2ブラウザで 2vs2 RSP が最後まで遊べる**。合流に必要な最小セット:

```
担当1: W-01 ─┬─ W-02 ─ W-04 ───────────────┐（auth）
             ├─ W-15（compose・継続）        │
担当2: ......└─ W-10 ─ W-11 ─ W-08 ─ W-09 ──┤（game/lobby server）
担当3: ......... F-01 ─ F-02 ─ F-03 ─ F-05 ─┤（lobby UI）
担当4: ..................... F-06 ─ F-07 ─ F-08┘（game UI）
                                              ▼
                                     ゲート2（2vs2 RSP 対戦成立）
```

- **担当2 の W-10 は Day 1 着手可**（E-11 完了済み）。auth を待たずに「Node 単体で sim.wasm が複数ルーム駆動する」ところまで先行できる＝最大の並行余地。
- W-08（ロビー WS）と F-05（ロビー UI）は auth（W-04）着地後。
- 4人の合流は **W-11（ゲーム WS）× F-06（GameView）** の1点。ここを両者が §4 の snapshot 契約で先に紙合わせしておくと、実装後の結合が速い。
- ゲート2 後の残り（W-13 永続化・F-09 統計・W-06/07 フレンド等）は Day 8〜11 で各自のレーンに戻って消化（ゲート3）。

---

## 6. 人間確認タスク（コードでは閉じない）

| 項目 | 誰 | 内容 |
|---|---|---|
| G-09 マップのテストプレイ承認 | 全員 | 現状は1人プレイでの検証に限る（対人は W/F 完成後）。`./cub3D maps/fps_map/fps_duel.cub` 等でスポーン公平性・動線・関門の完走を確認 |
| CI 初回 green | オーナー（samatsum） | GitHub billing ロックの解除（public リポなので Actions は無料。未払い/カードの解消）。解除後 Re-run |

---

## 7. 並行作業のルール（1人 → 4人で変わる点）

これまで1人だったので直接 main へ積んでこられたが、4人では衝突と退行を防ぐ運用に切り替える。

1. **ブランチ**: Issue 単位の feature ブランチ → PR。main へ直 push しない。
2. **CI を通す**: PR は `.github/workflows/ci.yml`（native/web/sim + `make check` + `make test` + xvfb smoke）が green で初めてマージ可（billing 解除後）。**C 側（壱・肆）を壊す変更は CI が止める**。
3. **契約変更は先に合意**: ②③ や `shared/` zod を変えるときは所有者（§4）に相談 → 設計書を先に改訂してから実装（各設計書の原則欄）。
4. **コミット規約**: CR021 に従い本文に Why を書く。**Co-Authored-By は付けない**。
5. **C 側は原則凍結**: 弐/参 の作業で C（`codes/`）を触る必要が出たら、それは設計の見落としの兆候。担当2（sim API 所有）に相談してからにする。
6. **共有の正本**: 進捗と Issue の受入は [BACKLOG.md](./BACKLOG.md)。本書は分担の地図。ズレたら両方直す。
