# reading guide: mamiyaza（フロント基盤 / PO）

> 対象: mamiyaza  
> 直前に読むもの: [onboarding.md](./onboarding.md)（**未読なら必ず先に**）  
> **このファイルを読む時間の目安**: 1〜1.5時間（手元での起動確認を含む）  
> 作成: 2026-07-29（AI 草案 → 本人レビュー前提）

---

## ゴール（読了後）

F-01（フロント雛形）着手前に、「REST 契約の消費側として何を守るか」を設計書から確認した状態にする。

---

## 略号（本ファイルで使うもの）

| 略号 | 意味 | 正本 |
|---|---|---|
| **F-xx** | Frontend 側の Issue | [02_設計書/5-バックログ.md](../02_設計書/5-バックログ.md) §5 |
| **W-xx** | Backend / DevOps 側の Issue（mamiyaza は主に消費・結合） | 同 §4 |
| **REST** | HTTP で JSON をやり取りする API | [02_設計書/3-REST_API設計.md](../02_設計書/3-REST_API設計.md) |
| **zod** | TypeScript で「この JSON はこの形」と実行時に検査するライブラリ。ブラウザ（FE）とサーバ（BE）が **同じ定義**を `app/shared` から import する | [torinoue_用語集.md](../torinoue/torinoue_用語集.md) §7.14 |
| **WS** | WebSocket。ロビー接続で使う | [02_設計書/2-WSプロトコル設計.md](../02_設計書/2-WSプロトコル設計.md) |
| **ゲート2** | 対人対戦成立の関門 | [02_設計書/6-チーム分担計画.md](../02_設計書/6-チーム分担計画.md) §5.1 |

---

## 1. mamiyaza の役割

mamiyaza は **画面の土台と、ゲーム画面以外の全ページ**を作る。  
REST API（torinoue が実装）とロビー WS（samatsum が実装）の**消費側**。  
エンジン（C / `render.wasm` / `sim.wasm`）の中身を読む必要はない。

| mamiyaza が所有する | 触る前に確認する（非所有） |
|---|---|
| F-01〜F-05、F-09〜F-11 の画面 | REST エンドポイント仕様（torinoue。[02_設計書/3-REST_API設計.md](../02_設計書/3-REST_API設計.md)） |
| `app/shared/` の zod は**必須レビュアー**（所有者は torinoue） | WS メッセージ形（samatsum。[02_設計書/2-WSプロトコル設計.md](../02_設計書/2-WSプロトコル設計.md)） |
| Privacy / ToS の実文面（F-04） | GameView / HUD（hminemur） |

管理役割: **プロダクトオーナー（PO）** — 優先順位・完了検証・バックログ管理。技術最終決定は samatsum（TL）。

### 用語注（画面・機能）

| 語 | 種別 | 意味 | 出典 |
|---|---|---|---|
| **ロビー** | 画面用語（コーディング用語ではない） | 試合前の待合・マッチング画面（オンライン一覧・キュー・ルーム等） | [02_設計書/4-フロントエンド設計.md](../02_設計書/4-フロントエンド設計.md) §3.2 / [torinoue_用語集.md](../torinoue/torinoue_用語集.md) §7.4 |
| **フレンド** | 課題の機能名 | ユーザー同士の友達関係・オンライン表示など | 課題のユーザー管理 / [02_設計書/3-REST_API設計.md](../02_設計書/3-REST_API設計.md) のフレンド節 / フロント設計 §3.2 |
| **アバター** | 課題の機能名 | プロフィール画像のアップロード・表示 | 同上 / フロント設計 §3.4 |
| **Privacy / ToS** | 法務・画面用語 | Privacy Policy / Terms of Service。フッターから到達必須（拒否条件） | フロント設計 §3.5 / チーム分担計画 Day5 |
| **HUD** | ゲーム画面用語（mamiyaza の非所有） | 対戦中のスコア等のオーバーレイ。**hminemur 担当** | フロント設計 §3.3 |

---

## 2. 読むファイル

### ★★★ 必須（この順）

| # | ファイル | 読む範囲 | なぜ |
|---|---|---|---|
| 1 | [02_設計書/6-チーム分担計画.md](../02_設計書/6-チーム分担計画.md) | §3 mamiyaza + §4 共有契約 | mamiyaza の持ち物と境界 |
| 2 | [02_設計書/3-REST_API設計.md](../02_設計書/3-REST_API設計.md) | §0 決定表 + §1 共通規約（エラーエンベロープ等） | mamiyaza が消費する API の形 |
| 3 | [02_設計書/3-REST_API設計.md](../02_設計書/3-REST_API設計.md) | §2-A 認証（signup/login/logout/me）だけ | F-03（認証画面）の仕様元 |
| 4 | `app/shared/src/`（`error.ts` / `health.ts` / `index.ts` 等） | 短いファイル全部 | W-01 で置かれた契約の型。F-02 で fetch ラッパから import |
| 5 | [02_設計書/4-フロントエンド設計.md](../02_設計書/4-フロントエンド設計.md) | §1〜§3（全体構成・ルーティング・認証/ロビー） | 画面仕様 |
| 6 | `app/frontend/src/App.tsx` | 全部 | F-01 の出発点 |

### ★★☆ 余裕があれば

| ファイル | 範囲 | なぜ |
|---|---|---|
| [説明用/appとweb-完成したエンジンとこれから作る層.md](../説明用/appとweb-完成したエンジンとこれから作る層.md) | 全部 | `app/` と完成エンジンの関係 |
| [説明用/どの言語がどこで動くのか.md](../説明用/どの言語がどこで動くのか.md) | 表だけ | C / TS / WASM の配置 |
| [02_設計書/2-WSプロトコル設計.md](../02_設計書/2-WSプロトコル設計.md) | ロビーメッセージの節だけ | F-05 で消費する WS の形 |

### ★☆☆ スキップ（理由付き）

| ファイル | スキップ理由 |
|---|---|
| 説明用 説1〜説8（pf / ループ / ビルド / snapshot / 戦闘員 / 並列 / WASM / cub） | エンジン内部。mamiyaza はエンジンを呼ばない |
| `03_実装レポート/` 全4本 | Engine 完了の証跡。mamiyaza のブロッカーではない |
| `04_エンジン資料/` | C 側の規約と仕様。C を書かない |
| WS 設計の snapshot 形・GameRoom 状態機械 | hminemur と samatsum の領域 |
| REST 設計のユーザー詳細・フレンド・アバター以降 | ゲート2 後／切り捨て候補。今は読まない |

---

## 3. 第一手

```bash
cd /path/to/ft_transcendence
npm install
npm run dev:frontend   # Vite
# 別ターミナル
npm run dev:backend    # Fastify
```

ブラウザでフロントを開き、DevTools Console で health チェックが通ることを確認する。  
`app/shared` の zod と `app/frontend` の fetch が繋がっていることが分かる。

**F-01 でやること**: この骨格に Router / ErrorBoundary / StrictMode を足す（詳細はバックログ F-01 とフロント設計）。

---

## 4. 読了後の自己確認

- [ ] エラーエンベロープの形を、暗記せず [02_設計書/3-REST_API設計.md](../02_設計書/3-REST_API設計.md) §1 で指せる  
- [ ] `app/shared` の役割（FE/BE が同じ zod を import する単一情報源）を言える  
- [ ] mamiyaza が WS メッセージ形を勝手に変えてはいけない理由を言える  
- [ ] mamiyaza が snapshot / `render.wasm` / `sim.wasm` を触らない理由を言える  
- [ ] torinoue と合わせるべき1点（W-04 の Cookie → F-03 で受け取る）を指せる  
