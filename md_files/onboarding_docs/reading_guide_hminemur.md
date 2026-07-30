# reading guide: hminemur（GameView / HUD / 統合）

> 対象: hminemur  
> 直前に読むもの: [onboarding.md](./onboarding.md)（**未読なら必ず先に**）  
> **このファイルを読む時間の目安**: 1.5〜2時間（`replay.html` を動かす時間を含む）  
> 作成: 2026-07-29（AI 草案 → 本人レビュー前提）

---

## ゴール（読了後）

F-06（GameView）着手前に、「`render.wasm` に何を渡すと絵が出るか」をコードで確認した状態にする。

---

## 略号（本ファイルで使うもの）

| 略号 | 意味 | 正本 |
|---|---|---|
| **F-xx** | Frontend 側の Issue（hminemur は主に F-06〜F-08） | [02_設計書/5-バックログ.md](../02_設計書/5-バックログ.md) §5 |
| **W-xx** | Backend / DevOps 側の Issue（結合相手は主に W-11） | 同 §4 |
| **render.wasm** | ブラウザで絵を描く WASM | [説明用/3つのビルドターゲット.md](../説明用/3つのビルドターゲット.md) |
| **sim.wasm** | サーバ側の判定専用 WASM（hminemur は直接駆動しない） | 同上 |
| **snapshot** | サーバが送る「試合状態の写真」。クライアントは判定せず描画する | [説明用/スナップショットと補間.md](../説明用/スナップショットと補間.md) |
| **スロット** | 試合の参加枠（旧文面の「席」）。RSP は4枠など | [説明用/戦闘員統合-人もNPCも同じリスト.md](../説明用/戦闘員統合-人もNPCも同じリスト.md) |
| **ゲート2** | 対人対戦成立の関門 | [02_設計書/6-チーム分担計画.md](../02_設計書/6-チーム分担計画.md) §5.1 |

---

## 1. hminemur の役割

hminemur は **対戦画面の配線役**。  
samatsum が用意した `render.wasm`・補間・snapshot の部品を、React の Canvas 周りに繋ぐ。  
レイキャスタや DDA などのエンジン内部数学を読む必要はない。仕事は「snapshot を受け取って render に渡す」パイプラインを通すこと。

| hminemur が所有する | 触る前に samatsum / torinoue に確認（非所有） |
|---|---|
| F-06 GameView / F-07 HUD / F-08 マッチ遷移 | WS メッセージ形（[02_設計書/2-WSプロトコル設計.md](../02_設計書/2-WSプロトコル設計.md) — samatsum） |
| Canvas への描画呼び出し | `sim.wasm` / GameRoom（samatsum） |
| `snapshot_interp.js` の**呼び出し**（計算実装は Engine 完了済み・流用） | REST / Cookie / DB（torinoue） |

管理役割の追加なし（開発者専任）。ゲート2 の統合役の一角。

### 用語注

| 語 | 種別 | 意味 | 出典 |
|---|---|---|---|
| **GameView** | コーディング／画面名 | 対戦中の Canvas＋入力の画面単位（Issue F-06） | [02_設計書/4-フロントエンド設計.md](../02_設計書/4-フロントエンド設計.md) / バックログ F-06 |
| **HUD** | ゲーム画面用語 | Heads-Up Display。スコア・状態・演出などの DOM オーバーレイ（3D 世界は `render.wasm`） | フロント設計 §3.3（決定 D-11） |
| **補間** | 実装用語 | サーバが低い頻度で送る snapshot の間を埋めて、描画をなめらかにする | [説明用/スナップショットと補間.md](../説明用/スナップショットと補間.md) |
| **ロビー** | 画面用語（F-05 は mamiyaza） | 試合前の待合。hminemur はマッチ成立後の遷移で接続する | フロント設計 §3.2 |

---

## 2. 読むファイル

### ★★★ 必須（この順）

| # | ファイル | 読む範囲 | なぜ |
|---|---|---|---|
| 1 | [02_設計書/6-チーム分担計画.md](../02_設計書/6-チーム分担計画.md) | §3 hminemur + §4 共有契約 + §2 引き継ぎ資産 | hminemur の持ち物と境界 |
| 2 | [説明用/スナップショットと補間.md](../説明用/スナップショットと補間.md) | 全部 | **hminemur の仕事の核心** |
| 3 | [説明用/戦闘員統合-人もNPCも同じリスト.md](../説明用/戦闘員統合-人もNPCも同じリスト.md) | 前半（スロットと入力源の説明まで） | snapshot に乗る combatant の意味 |
| 4 | [02_設計書/2-WSプロトコル設計.md](../02_設計書/2-WSプロトコル設計.md) | snapshot 形の節（§5-C 相当）だけ | samatsum から届く JSON。**F-06 の入力仕様** |
| 5 | `web/sim_demo/replay.html` + `replay.js` | 手元で動かす（§3） | F-06 はこれの React 化 |
| 6 | `web/snapshot_interp.js` | 全部（短い） | 補間。F-06 で流用 |

### ★★☆ 余裕があれば

| ファイル | 範囲 | なぜ |
|---|---|---|
| [説明用/なぜNodeでCを動かせるのか-WASM入門.md](../説明用/なぜNodeでCを動かせるのか-WASM入門.md) | 全部 | `render.wasm` ロードの背景 |
| [説明用/cubマップの読み方.md](../説明用/cubマップの読み方.md) | マップ文字の表だけ | HUD に出す情報の意味 |
| [02_設計書/4-フロントエンド設計.md](../02_設計書/4-フロントエンド設計.md) | GameView / HUD の節 | 画面仕様 |

### ★☆☆ スキップ（理由付き）

| ファイル | スキップ理由 |
|---|---|
| 説明用 説1〜説3（pf / ループ反転 / ビルドターゲット） | エンジン内部。hminemur は `render.wasm` を呼ぶだけ |
| `03_実装レポート/` 全4本 | Engine 完了の証跡。hminemur のブロッカーではない |
| [02_設計書/3-REST_API設計.md](../02_設計書/3-REST_API設計.md) | torinoue の領域。対戦描画の本線では REST を主に使わない |
| `04_エンジン資料/` | C を書かない |
| レイキャスタの原理（印刷用エンジン全記録の該当章など） | 描画の中身。`web_render_frame()` を呼ぶだけ |

---

## 3. 第一手: `replay.html` を動かす

```bash
cd /path/to/ft_transcendence
node web/sim_demo/record.mjs
# → web/sim_demo/snapshots.json が生成される

python3 -m http.server 8000
# → http://localhost:8000/web/sim_demo/replay.html
```

動いたら確認すること:

- [ ] Canvas に試合が描画されている  
- [ ] キャラクターがなめらかに動いている（補間）  
- [ ] スコア等が出ている  
- [ ] DevTools Console にエラーがない  

**replay 側の核心（概念）**:

1. snapshot を `render.wasm` に流す（`web_apply_snapshot` 相当）  
2. 1フレーム描画する（`web_render_frame` 相当）  
3. これを毎フレーム繰り返す  

**F-06 でやること**: `snapshots.json` を読んでいる箇所を、WS 受信バッファ（samatsum の W-11）に差し替える。描画と補間のコアは変えない（チーム分担計画 §3 hminemur）。

---

## 4. 読了後の自己確認

- [ ] 「snapshot とは何か」を hminemur の言葉で言える  
- [ ] `web_apply_snapshot` と `web_render_frame` の役割を言える  
- [ ] 補間が必要な理由（サーバ更新頻度と画面描画頻度の差）を言える  
- [ ] hminemur が REST / 認証 / DB を本線で触らない理由を言える  
- [ ] samatsum と合わせるべき1点（WS 設計の snapshot JSON 形）を指せる  
