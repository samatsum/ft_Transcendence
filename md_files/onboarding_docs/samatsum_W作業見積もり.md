# samatsum 作業見積もり（60分スロット）

> 対象: samatsum（ゲームサーバー / TL）  
> 関連: [reading_guide_samatsum.md](./reading_guide_samatsum.md)  
> 作成: 2026-07-30（AI 草案 → 本人レビュー前提）  
> **契約の正本ではない**。受入条件は [02_設計書/5-バックログ.md](../02_設計書/5-バックログ.md) §4 が正。

---

## 1. このドキュメントの目的

samatsum 担当分野の**残作業**（2026-07-30 時点）を分解し、**60分スロット**で総量を見積もる。

- **完了済み Issue は計上しない**（W-01, W-09〜W-12, W-14, W-08 コア）
- 1日あたりの稼働時間は考慮しない
- [torinoue_W作業見積もり.md](./torinoue_W作業見積もり.md) と同前提（初見・バッファ込み）

---

## 2. 見積もり前提

| # | 前提 |
|---|---|
| 1 | **残作業のみ** — 2026-07-30 時点でゲームサーバ本体（W-10/W-11/W-08 コア等）は main 済み |
| 2 | トータルスロット数から要求作業時間を見積もる |
| 3 | 他メンバー待ちは度外視 |
| 4 | W-04/W-05 の Cookie/Origin **実装**は torinoue。samatsum は**結合支援・検証**のみ |
| 5 | W-13 **永続化実装**は torinoue。samatsum は `match_end` / `persistMatch` **連携** |
| 6 | **W-16** の `ci.yml` 変更レビューは samatsum（実装の主担当は torinoue/mamiyaza） |
| 7 | **TL 管理** は実装外で **+4 スロット**（軽量計上） |

---

## 3. 完了済み（本見積もりに含めない）

| Issue | 状態 |
|---|---|
| W-01 | ✅ リポジトリ骨格 |
| W-10 | ✅ GameRoom + sim.wasm |
| W-11 | ✅ ゲーム WS |
| W-08 | ✅ コア（W-04/W-05 本結合待ち） |
| W-09 | ✅ マッチメイキング |
| W-12 | ✅ 切断/再接続/AI |
| W-14 | ✅ maps + map_text |

---

## 4. 残作業スロット一覧

| 区分 | 内容 | スロット | 作業時間 |
|---|---|---:|---:|
| **W-08 結合支援** | torinoue W-05 後の `check:lobby` 本 Cookie pass | **1** | 1h |
| **W-13 連携** | persistMatch / match_end / №3 経路 | **3** | 3h |
| **W-16 レビュー** | mamiyaza FE lint 追加の `ci.yml` レビュー | **1** | 1h |
| **H-01** | ゲーム/WS 系提出前チェック | **2** | 2h |
| | **実装小計** | **7** | **7h** |
| **TL** | 契約レビュー・技術決定・PR レビュー（軽量） | **4** | 4h |
| | **合計** | **11** | **11h** |

---

## 5. 推奨着手順

```text
（torinoue W-05 着地待ち）→ W-08 結合支援 → W-13 連携（torinoue W-13 と並行）
  → W-16 レビュー → H-01
```

| タイミング | 内容 |
|---|---|
| torinoue W-05 後 | スロット 1：本 Cookie + Origin で lobby/game WS pass |
| torinoue W-13 着手時 | スロット 2〜4：`persistMatch` 境界のデバッグ支援 |
| mamiyaza W-16 PR 時 | スロット 5：ci.yml レビュー |
| Day5 前 | スロット 6〜7 + TL 4：H-01 と横断レビュー |

---

## 6. スロット内訳（1〜7）

### W-08 結合支援（スロット 1）

| # | 内容 |
|---|---|
| 1 | `npm run check:lobby` を本 Cookie + `ALLOWED_ORIGIN` 環境で pass。失敗時 torinoue と切り分け |

### W-13 連携（スロット 2〜4）

| # | 内容 |
|---|---|
| 2 | `PersistedMatchContext` / `persistMatch` コールバックの契約確認（`game/room.ts`） |
| 3 | torinoue 永続化実装との通し（№1：決着→DB→`match_result`） |
| 4 | №3：`target_score=3` カスタムルーム 3 点決着経路の確認 |

### W-16 レビュー（スロット 5）

| # | 内容 |
|---|---|
| 5 | mamiyaza の FE lint/型検査ジョブ追加 PR をレビュー（E-14 資産 `ci.yml` 保全） |

### H-01（スロット 6〜7）

| # | 内容 |
|---|---|
| 6 | ゲーム WS / GameRoom ログ・秘密情報（token/input 非ログ）最終確認 |
| 7 | ゲート2/3 ゲーム系判定項目の TL としての pass 宣言 |

### TL 管理（スロット 8〜11）

| # | 内容 |
|---|---|
| 8 | snapshot 形など hminemur との契約維持レビュー |
| 9 | torinoue REST/WS 境界 PR レビュー |
| 10 | mamiyaza/hminemur ゲート2 結合 PR レビュー |
| 11 | 技術決定・C 凍結線の維持 |

---

## 7. torinoue との境界（二重計上防止）

| 作業 | 所有者 |
|---|---|
| `authenticateRequest` / `isAllowedOrigin` 本実装 | torinoue（W-04/W-05） |
| `session.ts` 差し替え | torinoue |
| lobby/game WS **呼び出し側** | samatsum 完了済み |
| 本 Cookie 結合後の **自動検査 pass** | samatsum スロット 1 |
| Match/MatchPlayer **DB 書込** | torinoue（W-13） |
| `match_end` 送出・`persistMatch` **フック** | samatsum 完了済み。連携デバッグのみ本表 |

---

## 8. 正本リンク

| 資料 | 用途 |
|---|---|
| [02_設計書/2-WSプロトコル設計.md](../02_設計書/2-WSプロトコル設計.md) | WS 契約（所有） |
| [02_設計書/5-バックログ.md](../02_設計書/5-バックログ.md) §6.1 | ゲート2 判定 |
| `app/backend/src/game/room.ts` | persistMatch フック |
| `npm run check:lobby` | W-08 自動検査 |
| [project_作業見積もり_合計.md](./project_作業見積もり_合計.md) | 4人合算 |

---

## 9. 後日更新

| 日付 | 内容 |
|---|---|
| 2026-07-30 | 初版（残作業 7 + TL 4 = 11 スロット） |
