作成者: torinoue:PM(tototec1234)  
作成日時: 2026-09-04  
改訂日時: 2026-09-04（ttubo レビュー反映: §3 CLI/Web 分岐、次 Issue は main から切るを明記）

# PR 作成手順 — feature ブランチから Pull Request まで

> **誰向け:** ブランチは切れるが PR は初めて、というフロントエンドメンバー（例: Issue #104 担当）。
> **メンター:** 先輩が手順確認・本文レビューを行う想定。
> **正本の Git ルール:** [Git運用フロー.html](./Git運用フロー.html)（ここでは PR までの実操作に絞る）。

---

## このドキュメントで扱う 4 ステップ

| ステップ | 日常語 | Git / GitHub 用語 |
|---|---|---|
| **1** | 最新の main を feature ブランチに取り込む | `fetch`, `merge`, upstream 取り込み |
| **2** | Issue を満たすか確認する | 受入検査 / 手動検証 |
| **3** | Pull Request を書いて出す | PR 作成（`Closes #104` 等） |
| **4** | （全体の流れ） | feature ブランチ → push → PR → CI → squash merge |

---

## F-03 と #104 の関係（PR を書く前に読む）

このリポジトリには **2 種類の Issue 番号** が並立しています。

| 名称 | 例 | 意味 |
|---|---|---|
| **レーン ID（backlog）** | F-03 | `docs/ai/backlog.md` の作業単位。[Issue #83](https://github.com/samatsum/ft_Transcendence/issues/83) が対応する GitHub Issue |
| **看板用の細分化 Issue** | #104, #105 | [GitHub Projects](https://github.com/users/samatsum/projects/1) で進捗管理しやすくするために F-03 を分割したもの |

```
F-03（Issue #83 … 認証画面 + route guard 全体）
  ├─ #104 … ログイン画面のみ   ← 本手順の対象
  └─ #105 … 新規作成画面
```

- **PR タイトル** はレーン ID に合わせ **`feat(F-03): ...`**（直近 PR の `feat(F-05):` と同型）。
- **PR 本文先頭** は **`Closes #104` のみ** → マージ時に **#104 だけ** 自動 Close。
- **`Closes #83` は書かない** — F-03 全体は #105 や route guard が残るため。書くと #83 だけ先に Close され、#104 / #105 が宙ぶらりんになる。
- `F-03（#104 / #105）` という trio の説明例: [PR #157](https://github.com/samatsum/ft_Transcendence/pull/157) 本文（ロビー WS クライアント層）。

### ブランチ名について

今回の `feature/104-login-screen` は **そのまま PR してよい**（rename しない：作業と管理の煩雑さを避けるため）。

<details>
<summary>rebase は使わない（知識メモ・クリックで表示）</summary>

main 同期は **merge** を使う。rebase との違い:

| | merge（本リポジトリ推奨） | rebase |
|---|---|---|
| 見た目 | 分岐と合流がグラフに残る | 自分のコミットが main の先頭に付け替わり、線が直線に見える |
| リスク | 低い | push 済みブランチだと force push が必要になりやすい |
| 本 repo で推奨する理由 | PR は **squash merge**（1 PR = main に 1 コミット）なので、feature ブランチ内の merge コミットは main 履歴に残らない。安全に main の変更を取り込める | 共有ブランチで履歴を書き換えると、他人（や未来の自分）が混乱しやすい |

rebase だと「ブランチを切った時点では存在しなかった main の変更を、最初から自分のコミットの上に載せた」ように見える、というのも rebase の性質上の特徴のひとつ。

</details>

本来は [Git運用フロー §03 命名規約](./Git運用フロー.html#naming) に従い **`feat/104-login-screen`** が正しい。`feature/` 接頭辞は規約外。**次回以降は `feat/` を使うこと！。**

---

## 0. 事前確認

```bash
git branch --show-current
# → feature/104-login-screen など、作業ブランチにいること

git branch -v
# → git branch --verbose の短縮形。
#    行頭に * が付いている行が現在のブランチ（例: * feature/104-login-screen）。
#    ターミナルによってはその行が緑色で表示されるので、色でも確認できる。
#    各行の右側は最新コミットの短い hash と件名。

git fetch origin
git log --oneline feature/104-login-screen..origin/main
# → 表示されたコミットは、まだ自分のブランチに入っていない main 側の変更
```

**取り込むべき main の変更は、PR を出す前に真っ先に merge する。**

---

## 1. 最新の main を feature ブランチに取り込む（main 同期）

### GitGraph の開き方

**コマンドパレット**（`Git Graph: View Git Graph`）と **ステータスバー左下の Git Graph** は **同じ画面** を開く。好きな方でよい。拡張が未インストールの場合は [Git Graph 拡張のインストール](#git-graph-install) を参照（ターミナル手順だけでも main 同期はできる）。

### GitGraph での操作

1. 上部 **Fetch** — リモート（`origin`）の最新位置をグラフに反映
2. ターミナルでローカル `main` を更新（下記 2〜3）。GitGraph 上の `main` ラベルも動く
3. 作業ブランチ（例: `feature/104-login-screen`）を checkout した状態で
4. ブランチ一覧の **`main` を右クリック** → **Merge into current branch**

### ターミナル（推奨・再現性が高い）

```bash
git fetch origin

git switch main
git pull origin main

git switch feature/104-login-screen
git merge main
```

**成功確認:**

```bash
git log --oneline --graph -8
```

feature ブランチの先端付近に `Merge branch 'main'` があり、その履歴に取り込んだ main のコミットが含まれていれば OK。

### fetch と pull の違い

| コマンド | すること |
|---|---|
| `git fetch origin` | リモートの最新**情報**を取得するだけ。作業ブランチのファイルはまだ変わらない |
| `git pull origin main` | `main` ブランチ上で fetch + merge。**ローカル `main` のファイル**が更新される |

**先に fetch してから pull する理由:** リモートで何が変わったかをグラフで確認してから、ローカル `main` に反映できる。いきなり pull だけだと、中身を見ずに main が更新される。

### コンフリクト（CONFLICT）が出たとき

1. Cursor で `<<<<<<<` マーカーのあるファイルを開く
2. main 側の変更と自分の変更を意図どおり残し、マーカーを削除して保存
3. ```bash
   git add <解決したファイル>
   git merge --continue
   ```
4. 取り込み後すぐ: `npm run typecheck` と `npm run build`

---

## 2. Issue #104 を満たすかテストする（受入検査）

### E2E（End-to-End）とは

**端から端まで** — ユーザーの操作（ブラウザでボタンを押す）から、必要なら server・DB まで含めて、一連の流れが動くか確認すること。

今回（ログイン UI + モック）では **E2E ではなく**、ビルド検査 + ブラウザ手動確認が中心。

### A. 必須 — ビルド検査

リポジトリルートで:

```bash
npm run typecheck   # shared / backend / frontend
npm run build
```

### B. 必須 — ブラウザ手動（初心者向け・主ルート）

**ターミナル 1:**

```bash
npm run dev:frontend
```

ブラウザで `http://localhost:5173/login` を開く。

| #104 の項目 | 今回の PR で満たす？ | 確認方法 |
|---|---|---|
| ユーザー名入力（FormField + Input） | はい | 画面にある |
| パスワード入力 | はい | 同上 |
| ログイン → **認証** → 部屋画面（`/lobby`） | **いいえ（モック）** | ボタンで `/lobby` には行けるが、`POST /api/auth/login` は呼んでいない |
| 認証失敗の表示 | **いいえ** | API 未接続 |
| 新規作成 → 新規作成画面 | はい | `/signup` へ遷移 |

**Issue #104 は「ユーザー名」表記、REST API（B-04）は `email` + `password`:** ラベルは Issue に合わせ、API 接続 PR で整合を取る。本 PR の「未検証・スコープ外」に明記する。

### frontend と backend

```
ブラウザ (:5173)              backend (:3000)
  frontend　　　　　　　　　　　　　　　│
  見た目・ボタン　　　　　　　　　　　　　│ POST /api/auth/login
  ────── /api/... ──────────────►  │ DB で確認 → Cookie
```

- **`npm run dev:frontend` だけ:** UI 確認はできる。**本物のログイン API は使えない**（backend が動いておらず、DB への導線もない）。
- **`npm run dev:backend` + `npm run dev:frontend`:** 本 API 結合確認用（今回のモック PR では任意）。

### C. 任意 — backend あり（2 ターミナル）

```bash
# ターミナル 1
npm run dev:backend

# ターミナル 2
npm run dev:frontend
```

### D. 任意 — Docker（本番に近い）

```bash
docker compose up --build
```

HTTPS・nginx 経由。初回は時間がかかる。**今回の PR では不要。**

---

## 3. PR を書く

### 3-1. push

```bash
git push -u origin feature/104-login-screen
```

（main merge 後の merge コミットがあればそれも含めて push）

### 3-2. 本文を用意する

[templates/pr-body-104.md](./templates/pr-body-104.md) を編集する（CLI / Web 共通）。

- 節: **何をしたか** / **検証したこと** / **未検証・スコープ外**（該当なしなら「なし」）
- 先頭: **`Closes #104` のみ**

### 3-3. PR を作成する（A/CLI **または** B/Web のどちらか一方）

#### A. CLI — `gh pr create`

テンプレをエディタで編集してから:

```bash
gh pr create \
  --title "feat(F-03): ログイン画面を実装する" \
  --body-file docs/human/運用/templates/pr-body-104.md
```

ヒアドク（`<<'EOF'`）より **ファイル指定** の方が、エディタで改行を確認でき、誤操作に強い。

- 成功すると **PR の URL / 番号**がターミナルに表示される
- ブラウザで **その PR を開く**（push 直後の Compare & pull request バナーは使わない）

#### B. GitHub Web

1. push 後、リポジトリの **Compare & pull request** をクリック
2. base: **`main`** / compare: 作業ブランチ
3. タイトル・本文は 3-2 で用意した内容を UI に入力（`gh` は使わない）

### 3-4. PR 作成後（CLI / Web 共通）

1. CI が緑になるまで待つ
2. PR コメント: `@coderabbitai review`
3. GitHub 上で merge（[Git運用フロー](./Git運用フロー.html)）

### 3-5. マージ後

- **#104** が自動 Close（`Closes #104` のため）
- ローカル `main` を追従: `git switch main && git pull`
- マージ済みブランチは削除（[Git運用フロー §05](./Git運用フロー.html#cleanup)）

### 3-6. 本 PR のあとに別 Issue を切る例

#104 の「認証する」を満たす **`POST /api/auth/login` 接続** は、F-03（#83）の残タスクとして **新しい GitHub Issue** を切り、看板で In progress に載せる。

> **ブランチは必ず `origin/main` から切る。** `feature/104-login-screen`（マージ前後を問わず）から
> そのまま `feat/login-api` などを切らない（[Git運用フロー](./Git運用フロー.html#donts) —
> squash merge 運用では、前の feature ブランチを base にすると main に届かない変更が残る）。
>
> ```bash
> git fetch origin
> git switch main
> git pull origin main
> git switch -c feat/login-api   # 例: 規約どおり feat/ 接頭辞
> ```

---

## 用語対応表

| ステップ | 日常語 | Git / GitHub 用語 | 本リポジトリでの呼び方 |
|---|---|---|---|
| 1 | main の最新を feature に入れる | fetch, merge | main 同期 |
| 2 | 動くか確認 | 手動テスト | typecheck / build / ブラウザ確認 |
| 3 | マージ申請 | Pull Request | PR（`Closes #104`） |
| 4 | 全体 | squash merge, CI | GitHub 上で統合 |
| 補足 | 端から端の確認 | E2E test | 今回は UI + ビルド中心 |
| 補足 | 履歴の付け替え | rebase | **merge 推奨** |

---

## 理解確認クイズ

メンターと一緒に答えを確認してから PR を出す。

### Q1. `git fetch origin` と `git pull origin main` の違いは？ main 同期ではどちらを先に？

<details>
<summary>A1（クリックで表示）</summary>

- **`git fetch origin`:** リモートの最新**情報**（`origin/main` の位置など）をローカルに取る。作業中のファイルは変わらない。
- **`git pull origin main`:** **`main` ブランチ上で** fetch + merge し、ローカル `main` のファイルを更新する。
- **順序:** 先に `fetch`（任意だが推奨）→ `main` に `switch` → `pull`。その後 feature ブランチに `merge main`。

</details>

### Q2. feature ブランチに main を取り込むとき、なぜ rebase ではなく merge を使う？

<details>
<summary>A2（クリックで表示）</summary>

本リポジトリでは **安全さ** と **squash merge 運用** が主因。

- merge なら push 済みブランチでも force push 不要
- PR マージ時に squash されるので、feature 内の merge コミットは main に残らない
- rebase は履歴を書き換えるため、共有ブランチでは混乱しやすい

（rebase だと「後から main の変更を知っていたかのように直線化される」という見え方も、rebase の性質として正しい。）

</details>

### Q3. PR 本文に `Closes #104` と書くと何が起きる？ `Closes #83` とは何が違う？

<details>
<summary>A3（クリックで表示）</summary>

- **`Closes #104`:** PR が **approve されて main にマージされたとき**、GitHub が **#104 だけ** 自動 Close。
- **`Closes #83`:** #83（F-03 全体）が Close されるが、#104 / #105 など細分化 Issue がまだ Open のまま **宙ぶらりん** になりうる。**今回は書かない。**

</details>

### Q4. 今回の PR で Issue #104 の「認証する」は満たす？ 満たさないなら PR のどの節に書く？

<details>
<summary>A4（クリックで表示）</summary>

**満たさない。** PR 本文の **「未検証・スコープ外」** に「`POST /api/auth/login` 未接続。認証はモック」と書く。本 API 接続は **別 Issue** として切り、ブランチは §3-6 のとおり **`origin/main` から**切る。

</details>

### Q5. `npm run dev:frontend` だけ起動した状態で、本物のログイン API は使える？

<details>
<summary>A5（クリックで表示）</summary>

**使えない。** 本物の API は **backend**（`:3000`）と **DB** が必要。frontend だけでは `/api/...` の先に server がいない。

</details>

---

<a id="git-graph-install"></a>

<details>
<summary>Git Graph 拡張のインストール（クリックで表示）</summary>

**Git Graph 拡張が未インストールの場合**、§1 のコマンドパレット・ステータスバーにメニューは出ない。

- 拡張ページ（Open VSX）: [mhutchie/git-graph](https://open-vsx.org/extension/mhutchie/git-graph)
- **VS Code / Cursor への入れ方:** 左サイドバーの **拡張機能**（Mac: `Cmd+Shift+X` / Windows: `Ctrl+Shift+X`）→ 検索欄に `Git Graph` → **mhutchie** 作の **Git Graph** を選び **Install**。または [Open VSX のページ](https://open-vsx.org/extension/mhutchie/git-graph) から **Install** を押す（エディタ連携が有効ならそのまま入る）。VS Code 単体なら [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=mhutchie.git-graph) からも同じ拡張を入れられる。

</details>

---

## 関連リンク

- [Git運用フロー.html](./Git運用フロー.html)
- [Issue #104 — ログイン画面](https://github.com/samatsum/ft_Transcendence/issues/104)
- [Issue #83 — F-03](https://github.com/samatsum/ft_Transcendence/issues/83)
- [REST API 認証（B-04）](../../ai/rest-api.md) — `email` + `password`
