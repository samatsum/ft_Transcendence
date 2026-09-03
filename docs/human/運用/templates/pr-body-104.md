Closes #104

> **F-03 と #104 の関係:** F-03（[Issue #83](https://github.com/samatsum/ft_Transcendence/issues/83) / backlog の「認証画面 + route guard」全体）を、看板（[Projects #1](https://github.com/users/samatsum/projects/1)）用に **#104（ログイン）** と **#105（新規作成）** に細分化した。**本 PR は #104 のみを Close する。F-03（#83）は Close しない**（#105・route guard 等が未完了のため）。参考: [PR #157](https://github.com/samatsum/ft_Transcendence/pull/157) の `F-03（#104 / #105）` 記述。

## 何をしたか

- （ここを編集）LoginPage に FormField + Input + ログイン/新規作成ボタンを実装
- （ここを編集）具体的な変更ファイル・挙動

## 検証したこと

- `npm run typecheck`: 通過（shared / backend / frontend）
- `npm run build`: 通過
- ブラウザ（`npm run dev:frontend`）で `/login` を操作:
  - 未入力時エラー表示
  - ログイン後 `/lobby` 遷移（**モック。API 認証ではない**）
  - 新規作成 → `/signup` 遷移

## 未検証・スコープ外

- Issue #104 の「ユーザー名とパスワードで**認証する**」: **未実装**（`POST /api/auth/login` 未接続。現状は `setUser` モック）
- 認証失敗時の API エラー表示: 未検証
- Issue 本文は「ユーザー名」、REST API（B-04）は `email` + `password`: 本 API 接続 Issue で整合を取る
- backend 起動を伴う結合確認: 未実施
- F-03 全体（#105 新規作成画面、route guard 完成）: スコープ外
