# md_files — ドキュメント目次

このディレクトリはプロジェクトの全ドキュメントを収める。**変更は「設計書を改訂してから実装」の運用**（各設計書の原則欄）に従うこと。

## subject/ — 課題要件（読み取り専用）

| ファイル | 内容 |
|---|---|
| [ft_トランセンデンス.md](./subject/ft_トランセンデンス.md) | 42 ft_transcendence の課題要件書（和訳）。全設計の正本要件 |

## design/ — ft_transcendence 設計書（上流工程の成果物・番号順に読む）

| # | ファイル | 内容 |
|---|---|---|
| 総 | [ARCHITECTURE_DESIGN.md](./design/ARCHITECTURE_DESIGN.md) | 全体アーキテクチャ・技術選定・モジュール14+5pt計画・体制・2週間スケジュール・評価対応 |
| ① | [ENGINE_SEPARATION_DESIGN.md](./design/ENGINE_SEPARATION_DESIGN.md) | cub3D エンジン分離（pf_* プラットフォーム層 / sim API / 3ビルドターゲット）。壱・肆の作業指示書 |
| ② | [WS_PROTOCOL_DESIGN.md](./design/WS_PROTOCOL_DESIGN.md) | WS プロトコル / GameRoom / マッチメイキング / 切断・再接続。弐の作業指示書 |
| ③ | [REST_API_DESIGN.md](./design/REST_API_DESIGN.md) | REST API（認証・ユーザー・フレンド・試合/統計・マップ）と Prisma スキーマ詳細 |
| ④ | [FRONTEND_DESIGN.md](./design/FRONTEND_DESIGN.md) | SPA 画面 / HUD / WS フック / Privacy・ToS。参の作業指示書 |
| ⑤ | [BACKLOG.md](./design/BACKLOG.md) | 統合バックログ（E/G/W/F 全 Issue・ゲート対応・決定記録 D-16〜D-18） |

決定番号の割当: D-1〜D-3（②）、D-4〜D-10（③）、D-11〜D-15（④）、D-16〜D-18（⑤ §0。旧 Q-1〜Q-3 の比較検討記録）。

## reports/ — 実施レポート（履歴。改訂しない）

| ファイル | 内容 |
|---|---|
| [GATE1_REPORT.md](./reports/GATE1_REPORT.md) | ゲート1（Emscripten スパイク E-01〜E-07）の go/no-go 判定と申し送り。**判定: go**（2026-07-11） |

## cub3d/ — 既存 cub3D 実装の正本（エンジン部分の現行仕様）

| ファイル | 内容 |
|---|---|
| [DEV_DOC.md](./cub3d/DEV_DOC.md) | 開発者向けアーキテクチャ仕様（モジュール構造・敵AI・RSP・チューニング値） |
| [USER_DOC.md](./cub3d/USER_DOC.md) | プレイヤー向けマニュアル（操作・`.cub` 記述ルール・RSP ルール） |
| [CODING_RULES.md](./cub3d/CODING_RULES.md) | C コーディングルールの正本。`make check` の `CRxxx` はここに対応 |
