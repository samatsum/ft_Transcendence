# F-07 — HUD オーバーレイ 8要素

**位置づけ**: [5-バックログ §5](../02_設計書/5-バックログ.md) の F-07 行を、
ファイル別に展開した実装レポート。上流工程レビュー(2026-07-31 samatsum)の結果と、
本作業で確定した4つのローカル決定を反映済み。契約の正本は
[④ フロントエンド設計 §3.3](../02_設計書/4-フロントエンド設計.md) と
[② WS プロトコル §5-B/§5-D](../02_設計書/2-WSプロトコル設計.md)。

作成: 2026-07-31 ／ 担当: **samatsum**(本来 hminemur 主担当だが連絡不通のため代行)

---

## 0. 一言でいうと

F-06 の GameView に載せる HUD 8要素:
- スコアバー(RSP `[赤 7 - 4 青]` / FPS はメッセージ表示のみ)
- 対戦者ステータス行(名前 + 状態バッジ)
- 得点演出(画面縁フラッシュ + スコアバー強調)
- 自分の手フラッシュ(自席の `hand_changed` のみ)
- カウントダウン(3→2→1→GO!)
- match_end モーダル(勝敗・最終スコア・詳細表・「ロビーへ戻る」)
- 自分の接続バナー(再接続中… / 切断されました)
- 観戦 HUD の枠(F-12 用の受け皿)

**評価要件**: ゲート2 の芯「対戦成立して見て分かる」の担保。②§10-B №4「タブ閉じ → 30秒以内で復帰 + grace/ai/connected の遷移が見える」の目視。

---

## 1. 依存

| 依存 | 状態 | 影響 |
|---|---|---|
| **F-06** GameView 統合 | ✅ merge 済み | HudOverlay の差し込み先 |
| **F-01** ToastContext / Modal / Button | ✅ merge 済み | match_end モーダル + 「復帰しました」トースト |
| **F-02** useApi | ✅ [PR #34](https://github.com/samatsum/ft_Transcendence/pull/34)(本 PR の親) | match_end 後の `/api/matches/:id` 取得 |
| ② §5-D event / §5-B player_status | ✅ | zod 契約(shared/ws/game.ts) |
| **W-13** 試合永続化 + `/api/matches/:id` | 未着手(torinoue) | 完成後、match_end モーダルに詳細表が出るようになる |
| **welcome 拡張(seats)** | 未定(別 PR 予定) | 対戦者名の実名化 |

---

## 2. 上流工程レビューで見つけた穴と、確定した決定(2026-07-31)

| # | 穴 | 決定 |
|---|---|---|
| 1 | 対戦者「名前」の取得口(welcome/snapshot に無い) | **F-07 は placeholder(`Player 0` / `AI`)で描画**。実名対応は `welcomeMessageSchema` に `seats: [{slot, display_name, is_ai}]` を追加する別 PR で。HUD 側は `name` prop で受けるので差し替え容易 |
| 2 | `player_status` の初期状態(明示配信なし) | **snapshot.combatants から導出**。`is_ai=true` → 'ai'、false → 'connected'。以後は `player_status` メッセージ・event で上書き |
| 3 | フラッシュ/countdown の視覚パラメータ(未定義) | 実装判断: countdown は event(seconds:3) を受けて 3→2→1→"GO!" と1秒ずつ、match_start で消える。point_scored フラッシュ 500ms、hand_changed 自席フラッシュ 300ms |
| 4 | match_end 後の詳細取得(W-13 未着手) | `useApi().get('/api/matches/:id', { schema, toast: false })` で試み、失敗時は最終 snapshot だけで結果表示。W-13 完成後に自動で成績表が出る |

---

## 3. 触ったファイル

**新規(hud: 7 / state hook: 2 / test: 1 / doc: 1)**

| パス | 責務 |
|---|---|
| `app/frontend/src/game/hudState.ts` | pure リデューサ(applyGameEvent / applyPlayerStatus / seatsFromSnapshot / expireFlashes) |
| `app/frontend/src/game/useHudState.ts` | React hook。lastEvent → applyGameEvent、200ms polling で snapshot tail から score/seats、countdown 1秒 timer |
| `app/frontend/src/game/hud/ScoreBar.tsx` | RSP スコアバー(得点フラッシュ強調) |
| `app/frontend/src/game/hud/PlayerStatusRow.tsx` | 上部右の対戦者ステータス行(grace は 500ms 間隔で残秒更新) |
| `app/frontend/src/game/hud/Countdown.tsx` | 全画面の 3・2・1・GO! オーバーレイ |
| `app/frontend/src/game/hud/MatchEndModal.tsx` | 勝敗・最終スコア・詳細表・ロビーへ戻る |
| `app/frontend/src/game/hud/ScreenEdgeFlash.tsx` | 画面縁の色枠(point+hand の合成) |
| `app/frontend/src/game/hud/ConnectionBanner.tsx` | 自 WS の接続/再接続/切断バナー |
| `app/frontend/src/game/hud/HudOverlay.tsx` | 上記を welcome/event/player_status/status から配線する統合コンポーネント |
| `app/frontend/src/game/hudState.test.ts` | vitest 12件 |
| `md_files/03_実装レポート/F-07_HUDオーバーレイ.md` | 実装レポート |

**編集**

| パス | 変更内容 |
|---|---|
| `app/frontend/src/pages/GameView.tsx` | ad-hoc なオーバーレイを廃し `<HudOverlay />` に置換。match_end 時の `/api/matches/:id` fetch と「ロビーへ戻る」navigate を追加 |

---

## 4. 受入条件

**④ §3.3 HUD 表 8要素**:

- ✅ スコアバー(RSP チーム色付き。得点時ハイライト) / FPS はメッセージ表示
- ✅ 対戦者ステータス行(名前 + `接続中 / 切断中(残n秒) / AI` バッジ、自席は sky-400 リング強調)
- ✅ 自分の手フラッシュ(自席 `hand_changed` で 300ms amber の縁フラッシュ)
- ✅ 得点演出(500ms チーム色の縁フラッシュ + スコアバー強調)
- ✅ カウントダウン(3→2→1→GO! を1秒ずつ、`match_start` で消える)
- ✅ match_end モーダル(勝敗・最終スコア・詳細表・「ロビーへ戻る」)
- ✅ 自分の接続バナー(reconnecting → 「再接続中…」、closed → 「切断されました」)
- ✅ 観戦 HUD の枠(F-12 の視点切替は未実装、welcome.role='spectator' の分岐だけ入り口を用意)

**⑤ F-07 受入 (④ §6-6)**:
- ✅ grace → AI の遷移表示 → `player_disconnected` を event 経由で受け `grace` バッジ + 残秒表示、満了で `ai_takeover` バッジへ

**F-07 固有**:
- ✅ TypeScript typecheck 通過(3 workspace)
- ✅ vitest 35件通過(snapshot 9 + apiFetch 14 + hudState 12)
- ✅ vite build 通過(gzip 107KB / +3KB from F-02)
- ⏳ 実 backend との match_end → /api/matches/:id 取得は W-13 完了後
- ⏳ 実プレイでの視覚 QA(色/位置/タイミング)は samatsum ローカルで

---

## 5. レビュー観点

| 観点 | 具体 |
|---|---|
| **snapshot polling の負荷** | 200ms 間隔で snapshotBufferRef の tail を読み score/seats を setState。5Hz 分の再レンダのみ。既存の 15Hz snapshot 受信自体は ref 経由で再レンダ無し |
| **countdown timer リーク** | useHudState の unmount で clearInterval 済み。event が来るたびに前の timer を clearInterval してから新しく張る |
| **`player_status` と event の二重経路** | player_disconnected 等の event(useHudState 経由)と、明示 `player_status` メッセージ(HudOverlay で seats に merge)の両経路がある。**event の方が rich(grace_ms を持つ)**、後追いの player_status は state 上書きだけ |
| **hand_changed の自席フィルタ** | useHudState 内で `event.id !== combatant_id` の event は state を変更しない。他席の hand 変更は演出しない(仕様どおり) |
| **match_end の match_id null** | 永続化失敗時。モーダルは `finalScore` だけで表示され、「試合の永続化に失敗」旨を amber 文言で通知 |
| **W-13 未実装期間の fetch エラー** | GameView の match_end fetch は `toast: false` + catch で握る。ユーザに Toast エラーが出ない |
| **観戦 HUD(F-12)の受け皿** | welcome.role='spectator' 時にキャプチャ案内を「観戦中」に切り替え。視点切替 UI は未実装(F-12 で追加) |

---

## 6. 関連ドキュメント

- [④ §3.3 GameView / HUD 8要素](../02_設計書/4-フロントエンド設計.md) — 契約の正本
- [② §5-B welcome / player_status / §5-D event 種別](../02_設計書/2-WSプロトコル設計.md) — 受信データ契約
- [F-06_GameView統合](./F-06_GameView統合.md) — 下敷き(canvas / snapshot buffer / event stream)
- [F-01_雛形整備](./F-01_雛形整備.md) — Modal / Button / ToastContext
- [F-02_fetchラッパ](./F-02_fetchラッパ.md) — useApi(match_end 後の詳細取得)

---

## 7. 状態

| 項目 | 値 |
|---|---|
| ステータス | **実装コミット済み**(2026-07-31)。**視覚 QA は samatsum のローカル環境で** |
| 担当 | **samatsum**(hminemur 代行) |
| クリティカルパス | **★はい**(ゲート2 の「対戦成立を見せる」担保) |
| 予定 Day | Day 3(5日制)。実装コミットは 2026-07-31 |
| 検証済み | typecheck(3 workspace) / vitest 35件 / vite build(gzip 107KB) |
| 未検証 | 実 backend との match_end → matches API 経路(W-13 待ち)、色/位置/タイミングの視覚 QA、実プレイでの grace→AI 遷移の目視 |

---

## 改訂記録

| 日付 | 内容 |
|---|---|
| 2026-07-31 | 初版(実装レポート)。上流工程レビューの4決定を反映。samatsum が hminemur 代行で作成。F-02 PR の上に積む形 |
