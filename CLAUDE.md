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

同じ事実を2言語で持つのは意図的ですが、**内容が食い違ったらそれは不整合**です。書式の正本は
[`docs/ai/doc-style-guide.md`](docs/ai/doc-style-guide.md)。

> **`docs/` を編集する前に、必ず
> [`docs/ai/doc-style-guide.md` §Before editing](docs/ai/doc-style-guide.md) を読むこと**
> （日本語版は [`docs/human/運用/ドキュメント作法.html#pitfalls`](docs/human/運用/ドキュメント作法.html)）。
> 2026-08 の監査で見つかった24件の不整合の大半が、そこに書かれた5つの落とし穴から生まれています。
>
> **そのうち最重要の1つだけ、ここにも書いておきます——1つの事実は `docs/ai/` + `docs/human/` +
> README 3種 + コードのコメントに散らばっています。直す前に grep して件数を数えること。
> 1箇所だけ直すのは修正ではなく、矛盾の作成です。** 実際に4回連続でこれをやりました。

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

---

## F-11 (#86) 作業中の特記事項（一時的）

> **注意:** この節は Issue #86 が完了したら削除してください。

Issue #141「ドキュメントの新調」が完了するまで、**F-11 の進捗と範囲は GitHub Issue #86 を正本とする**。

`docs/ai/backlog.md` §5 の F-11 行は 2026-08-08 時点の情報で止まっており、次の点が古いです:
- 依存関係（F-04 は完了、F-05 の接続層 #134 は完了・PR #157 マージ済み、試合開始 #111 は未着手）
- 対象画面（Profile は対象外、GameView は PR #171 が担当）
- 進捗（ログイン・ロビーハブ・HowToPlay は main に存在）

### 正本の所在

| 情報 | 正本 |
|---|---|
| 受入条件 | [Issue #86](https://github.com/samatsum/ft_Transcendence/issues/86) 本文 |
| 今回の範囲 | Issue #86 本文「## 今回の範囲（第1弾）」節 |
| 依存の現状 | Issue #86 本文「## 依存の現状」表 |
| 対象外の項目 | Issue #86 コメントおよび本文 |

### 第1弾の対象画面

- 認証（Login / Signup）
- Header / Footer
- ロビーハブ（`/lobby`）
- 部屋作成 / 参加（`/lobby/create`, `/lobby/join`）
- Privacy / ToS（`/privacy`, `/terms`）
- HowToPlay（`/lobby/how-to`）

### 対象外

- Profile（F-09 不採用）
- GameView のモバイル対応（PR #171 が担当）
- Modal の focus trap（今回の画面は Modal を開かない）
- 試合遷移（GV-08）
- 観戦（GV-12）

---

**採用モジュールは改訂されることがあります。** 不採用にした Issue は削除せず「不採用」と明記して
残す方針なので、バックログに行があること＝作業予定があること**ではありません**。
古いドキュメントやコミットが「予定」と書いていても、`architecture.md` §4 の現行の宣言が優先します。

## 作業上の注意

- 日本語ドキュメントには**波ダッシュが2種類混在**しています（U+301C `〜` と U+FF5E `～`）。
  一括置換するときは両方を文字クラスに入れること
- **Python の `\b` は日本語文字に対して機能しません**（日本語も単語文字扱い）。ID の一括置換では
  `(?<![A-Za-z0-9-])` と `(?![0-9])` を使うこと。ただしこの後読みは
  ハイフン連結された範囲の後半（`B-08-B-13` の `B-13`）も弾くので、範囲表記は事前に展開すること
- `git add -A` は使わないこと。意図しないファイルが混入します
