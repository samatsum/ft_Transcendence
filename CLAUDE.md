# CLAUDE.md

このファイルは**毎セッション自動で読み込まれます**。ここに置くのは「毎回必ず効く規約」だけ。
進捗・受入条件・モジュールの詳細のような**変化する情報は書かず、リンクで参照**してください。

## このリポジトリは何か

42 課題 ft_transcendence。C 製 cub3D エンジンを WebAssembly 化し、TypeScript の
サーバー権威モデルでオンライン対戦にしたもの。**同じ C ソースが native / `render.wasm` /
`sim.wasm` の3ターゲットへコンパイルされます**——この事実が下のレーン分割の根拠になります。
構成の詳細は [`docs/ai/architecture.md`](docs/ai/architecture.md)。

## レーン記号

Issue ID の接頭辞。**レーンは「どこで動くか」ではなく「何のコードで、誰が保守するか」で分けます。**
`render.wasm` はブラウザで動きますが Engine です——同じ `raycast.c` が native と wasm の
両方にコンパイルされるので、実行場所で線を引くと1ソースが2レーンに割れて担当境界として機能しません。

| 接頭辞 | レーン | 範囲 |
|---|---|---|
| `E-` / `G-` | Engine | `codes/` と `web/` の C エンジン。接頭辞2つで**1レーン** |
| `B-` | Backend | Fastify・認証・REST・WS・GameRoom・DB |
| `I-` | Infra / DevOps | リポジトリ骨格、Docker/nginx/TLS、CI |
| `F-` | Frontend | 一般 Web 画面（認証・レイアウト・ロビー） |
| `GV-` | GameView | ゲーム画面（Canvas + `render.wasm`・HUD・遷移・観戦） |

**`B-01` は存在しません。`B-15` / `B-16` も存在しません**（それぞれ `I-01` / `I-15` / `I-16`）。
存在しない ID を書かないこと。

`W-` は 2026-08-08 に廃止しました。**新規に `W-` を書かないこと。** ただし過去のコミット約85件と
クローズ済み Issue には残っており、書き換え不可能です。読むときは接頭辞だけ置換し番号はそのまま
（`W-12` は今の `B-12`）。対応表は [`docs/ai/git-workflow.md`](docs/ai/git-workflow.md) が正本。

## ドキュメントの二重構成

| 置き場 | 読者 | 形式 |
|---|---|---|
| `docs/ai/` | AI | 英語 Markdown |
| `docs/human/` | 人間 | 日本語 HTML |

同じ事実を2言語で持つのは意図的ですが、**内容が食い違ったらそれは不整合**です。片方だけ直した
場合は、なぜ片方だけなのかをコミット本文に書くこと。書式の正本は
[`docs/ai/doc-style-guide.md`](docs/ai/doc-style-guide.md)。

`docs/human/` は共有スタイルシート `docs/human/assets/style.css` を使います。唯一の例外は
`docs/human/説明用/技術スタック/印刷用.css`（カラー印刷用）。

## Git 運用

**`origin/main` が唯一の正本。** ブランチ → push → PR → CI 緑 → **GitHub 上でマージ** → `git pull`。
ローカル `main` へ直接マージ・直接コミットは禁止。正本は
[`docs/ai/git-workflow.md`](docs/ai/git-workflow.md)。

**squash マージ運用なので PR を積まないこと。** 別のフィーチャーブランチを base にすると、
下位 PR が先に squash された時点で上位 PR の成果物が `main` に到達しません。実際に PR #56 で
起きています。必ず `origin/main` から切ること。

ブランチ名は `<type>/<slug>`（`feat/` `fix/` `docs/` `chore/` `ci/`）。

## コミットメッセージ

件名は [Conventional Commits](https://www.conventionalcommits.org/)。scope に Issue ID を入れる。

```text
fix(B-12): 再接続時に seat が解放されない問題を直す
```

- 件名は英語でも日本語でもよいが、**1行の中で混ぜない**。周囲のコミットに合わせる
- **本文は日本語。** 差分を読めば分かることではなく、**なぜそうしたか**を書く
- **末尾に「検証:」節を置き、実際に実行したコマンドと結果だけを書く**
- 末尾に `Co-Authored-By:` トレーラ

## PR

- タイトルはコミット件名と同じ規約。**ブランチ全体**を代表する1行を書く
- 本文は日本語。`## 何をしたか` と `## 検証したこと` の2節が基本
- **PR 本文と Issue 本文ではリポジトリ相対パスが解決されません。**
  コードを引用するときは絶対 URL を使うこと
  （`https://github.com/samatsum/ft_Transcendence/blob/main/...`）。
  `../../` は `docs/` の中でなら動きますが、PR 本文では静かに壊れます
- レビューは `@coderabbitai review` を PR コメントで呼ぶ

## 検証（実行していないものを「検証した」と書かない）

これが**最重要の規約**です。「〜のはず」「問題ないと思われる」は検証ではありません。
実行できなかった検証がある場合は、その旨を明記してください。

```bash
npm run typecheck     # shared / backend / frontend
npm run build
npm run check:lobby   # ロビーWSの受入検査
make check            # C の lint
make test             # sim 公開API の受入テスト

# wasm の生成（ホストに emcc は不要。コンテナ内の emsdk を使う）
docker compose run --rm engine-build make frontend-engine-assets
```

ドキュメント変更時は、リンク切れ検査・HTML タグ開閉バランス・数値の突合を実際に走らせること。

**既知の偽陽性**: `docs/ai/doc-style-guide.md` の `../assets/style.css` は
コードブロック内の説明用文字列なので、実在しないのが正しい。

## 変化する情報はここを見る

| 知りたいこと | 正本 |
|---|---|
| モジュール構成・点数 | [`docs/ai/architecture.md`](docs/ai/architecture.md) §4 |
| Issue の受入条件・依存・進捗 | [`docs/ai/backlog.md`](docs/ai/backlog.md) |
| WS プロトコル | [`docs/ai/ws-protocol.md`](docs/ai/ws-protocol.md) |
| REST API・DB スキーマ | [`docs/ai/rest-api.md`](docs/ai/rest-api.md) |
| 画面仕様 | [`docs/ai/frontend.md`](docs/ai/frontend.md) |
| 誰がどのレーンにいるか | [`docs/human/はじめに/チーム体制.html`](docs/human/はじめに/チーム体制.html) |

**採用モジュールは改訂されることがあります。** 不採用にした Issue は削除せず「不採用」と明記して
残す方針なので、バックログに行があること＝作業予定があること**ではありません**。
古いドキュメントやコミットが「予定」と書いていても、`architecture.md` §4 の現行の宣言が優先します。

## 作業上の注意

- **新メンバー4名の担当割り振りをしないこと。** 参加時期も経験も揃っていないため未定です
- 日本語ドキュメントには**波ダッシュが2種類混在**しています（U+301C `〜` と U+FF5E `～`）。
  一括置換するときは両方を文字クラスに入れること
- **Python の `\b` は日本語文字に対して機能しません**（日本語も単語文字扱い）。ID の一括置換では
  `(?<![A-Za-z0-9-])` と `(?![0-9])` を使うこと。ただしこの後読みは
  ハイフン連結された範囲の後半（`B-08-B-13` の `B-13`）も弾くので、範囲表記は事前に展開すること
- `git add -A` は使わないこと。意図しないファイルが混入します
