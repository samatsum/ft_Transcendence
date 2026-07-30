# reading guide: torinoue（Auth / REST / DB / DevOps + PM）

> 対象: torinoue  
> 直前に読むもの: [onboarding.md](./onboarding.md)（未読なら先に）  
> **このファイルを読む時間の目安**: 実装用 1.5〜2時間 / PM 用は別途 30分（末尾）  
> 作成: 2026-07-29（AI 草案 → 本人レビュー前提）  
> 深い自分用メモ: [../torinoue/](../torinoue/)（契約の正本ではない）

---

## ゴール（読了後）

ゲート2 において「torinoue が止まると誰が止まるか」を、契約境界の言葉で説明でき、W-02 の第一手に入れる。

---

## 略号（本ファイルで使うもの）

| 略号 | 意味 | 正本 |
|---|---|---|
| **W-xx** | Backend / DevOps 側 Issue | [02_設計書/5-バックログ.md](../02_設計書/5-バックログ.md) §4 |
| **F-xx** | Frontend 側 Issue | 同 §5 |
| **zod** | TypeScript で JSON の形を実行時に検査するライブラリ。FE と BE が同じ定義を import する | [torinoue_用語集.md](../torinoue/torinoue_用語集.md) §7.14 / 実装は `app/shared` |
| **REST** | HTTP + JSON の API | [02_設計書/3-REST_API設計.md](../02_設計書/3-REST_API設計.md) |
| **ゲート2** | 複数ブラウザで RSP 対戦が最後まで成立する関門 | [02_設計書/6-チーム分担計画.md](../02_設計書/6-チーム分担計画.md) §5.1 |

---

## 1. torinoue の役割

torinoue は **REST・DB・認証・Docker の所有者**であり、ゲーム本体（`sim.wasm` / ゲーム WS）の所有者ではない。  
ゲート2 での仕事は対戦ロジックではなく、**ログインした人間だけがロビー／ゲームに入れる土台**を着地させること。

| torinoue が所有する | 触る前に相談する（非所有） |
|---|---|
| [02_設計書/3-REST_API設計.md](../02_設計書/3-REST_API設計.md)、`app/shared` の zod（mamiyaza と共同レビュー） | [02_設計書/2-WSプロトコル設計.md](../02_設計書/2-WSプロトコル設計.md) のメッセージ形（samatsum） |
| Session Cookie / Origin（W-04 / W-05） | GameRoom / snapshot（samatsum・hminemur） |
| Prisma スキーマ、W-15 docker | C（`codes/`）— 原則凍結 |

管理役割: **PM / SM**（進捗・ブロッカー・定例）。技術最終決定は TL = samatsum。優先順位の最終は PO = mamiyaza。

---

## 2. 読むファイル

### ★★★ 必須（この順）

| # | ファイル | 読む範囲 | なぜ |
|---|---|---|---|
| 1 | [torinoue_用語集.md](../torinoue/torinoue_用語集.md) | §1〜§2 | 以降の設計書が読めるようにする |
| 2 | [02_設計書/6-チーム分担計画.md](../02_設計書/6-チーム分担計画.md) | §3 torinoue、§4 共有契約、§5.1 Day1–3、§7 | 誰と何を合わせるか |
| 3 | [torinoue_データフロー図.md](../torinoue/torinoue_データフロー図.md) | 全部 | インターフェース確認 |
| 4 | [02_設計書/3-REST_API設計.md](../02_設計書/3-REST_API設計.md) | §0、§1、§2-A、§3 の User/Session だけ | torinoue の契約の芯 |
| 5 | `app/shared/src/error.ts` / `health.ts` / `index.ts` | 全部（短い） | 実装側の型の現状 |
| 6 | `app/backend/src/index.ts` | 全部 | W-02 の出発点 |
| 7 | [torinoue_PERT依存図.md](../torinoue/torinoue_PERT依存図.md) | ゲート2 まで | ブロッカー説明用 |
| 8 | [02_設計書/2-WSプロトコル設計.md](../02_設計書/2-WSプロトコル設計.md) | 認証・Origin に関する段落だけ | samatsum が torinoue に期待する入口 |

### ★★☆ 余裕があれば

| ファイル | 範囲 | なぜ |
|---|---|---|
| [説明用/appとweb-完成したエンジンとこれから作る層.md](../説明用/appとweb-完成したエンジンとこれから作る層.md) | 全部 | `app/` と完成エンジンの関係 |
| [説明用/どの言語がどこで動くのか.md](../説明用/どの言語がどこで動くのか.md) | 表だけ | C / TS / WASM の配置 |
| [02_設計書/5-バックログ.md](../02_設計書/5-バックログ.md) | W-02〜W-05、W-15 の行 | 受入条件の一文 |

### ★☆☆ 今はスキップ

| ファイル | スキップ理由 |
|---|---|
| `02_設計書/1-エンジン分離設計.md` / `04_エンジン資料/` / C レポート全文 | Engine 完了。Day1–3 のブロッカーではない |
| REST 設計のユーザー詳細・フレンド・アバター以降 | ゲート2 後／切り捨て候補 |
| フロント設計の画面詳細 | 消費側。契約は REST 設計と `app/shared` |
| 説明用 説1〜説8（pf / ループ / cub 等） | TL / ゲーム画面担当向け。ゲート2 のブロッカー説明に不要 |
| `02_設計書/0-全体アーキテクチャ設計.md` の14日表 | **日程としては無効**（チーム分担計画 §5.1 が正） |

---

## 3. ゲート2 における torinoue のブロッカー役（暗唱用）

```text
torinoue が Day2 中に W-04（認証 Cookie）を出さないと:
  - mamiyaza の F-03（認証画面）と F-05（ロビー）が結合できない
  - samatsum の W-08（ロビー WS）に「誰が接続したか」を差し込めない
結果: ゲート2 の「人として入る」経路が止まる。
対戦判定そのもの（W-10 / W-11）は samatsum が auth 無しでも先行できるが、
「ログインした人がロビーから試合に入る」は torinoue の着地が前提。
```

- **先行可能（auth 待ちでない）**: samatsum の W-10  
- **torinoue 依存**: W-08、F-03、F-05（およびその先のゲート2 合流）  
- **次の義務**: W-05（Origin）。W-15 は Day3 着手・Day4 完了（Day5 持ち越し禁止）

用語注:

| 語 | 種別 | 意味 | 出典 |
|---|---|---|---|
| ロビー | 画面／経路の用語 | 試合前の待合・マッチング UI、およびログイン後に試合へ進む経路の束 | [torinoue_用語集.md](../torinoue/torinoue_用語集.md) §7.4 / [02_設計書/4-フロントエンド設計.md](../02_設計書/4-フロントエンド設計.md) §3.2 |

---

## 4. 第一手（W-01 現状 → W-02）

| 済み（触って確認） | 未着手（torinoue の作業） |
|---|---|
| Fastify 起動、`GET /api/health` | pino 本設定、zod 検証パイプライン |
| 404 がエラーエンベロープ形 | レート制限、グローバルエラーハンドラ |
| `error.ts` / `health.ts` の骨格 | 認証用 zod、Prisma、Session Cookie |
| FE が health を zod で parse | `/api/auth/*` |
| `auth/session.ts` スタブ（Issue #11） | `authenticateRequest` / `isAllowedOrigin` の中身（W-04 / W-05） |

---

## 5. 読了後の自己確認

- [ ] 「REST 契約」を torinoue の言葉で言える  
- [ ] エラーエンベロープの形を、暗記せず [02_設計書/3-REST_API設計.md](../02_設計書/3-REST_API設計.md) §1 で指せる  
- [ ] W-04 が遅れたとき止まる Issue を3つ言える  
- [ ] `app/backend` と `app/shared` の役割の違いを言える  
- [ ] torinoue が WS メッセージ形を勝手に変えてはいけない理由を言える  

---

## 6. PM 用（実装と分離・追加 30分）

実装レーンとは別に PM 作業に入るとき: [torinoue_読む順_PM.md](../torinoue/torinoue_読む順_PM.md)

最短: チーム分担計画 §5.1 → PERT → バックログのゲート2 行 → 弱点分析の運用節。
