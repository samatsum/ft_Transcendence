# W-02 着手チェックリスト + curl 受入

> 親ドキュメント: [torinoue_W作業見積もり.md](./torinoue_W作業見積もり.md)（スロット 1〜7）  
> 関連: [reading_guide_torinoue.md](./reading_guide_torinoue.md) §4  
> 作成: 2026-07-30（AI 草案 → 本人レビュー前提）  
> **契約の正本**: [02_設計書/3-REST_API設計.md](../02_設計書/3-REST_API設計.md) §1 / [02_設計書/5-バックログ.md](../02_設計書/5-バックログ.md) W-02

---

## 1. W-02 の受入条件（再掲）

| 項目 | 正本 |
|---|---|
| バックログ一文 | 不正入力が ③§1-A の形で **400 / 429** になる |
| 実装対象 | pino 本設定・zod 検証パイプライン・グローバル EH・レート制限ミドルウェア |
| 検証手段 | **curl のみ**（本ドキュメント §5） |

---

## 2. 開始前チェックリスト（スロット 1 の前）

実装に入る前に、すべてにチェックを入れる。

### 2.1 環境

- [ ] リポジトリルート: `ft_Transcendence/`（`package.json` の workspaces が見える）
- [ ] Node.js **>= 20**（`node -v`）
- [ ] 依存インストール済み（`npm install` をルートで実行済み）
- [ ] `.env` または環境変数で `BACKEND_PORT=3000`（未設定なら 3000 既定で可）

### 2.2 設計・コードの読了

- [ ] [03 REST_API設計](../02_設計書/3-REST_API設計.md) **§1**（1-A エンベロープ / 1-B バリデーション / 1-C レート制限）
- [ ] [05 バックログ](../02_設計書/5-バックログ.md) **W-02 行**（受入条件）
- [ ] `app/shared/src/error.ts` — `errorEnvelopeSchema` / `makeError` / `errorStatusByCode`
- [ ] `app/shared/src/health.ts` — 既存 zod 共有の最小例
- [ ] `app/backend/src/index.ts` — W-01 骨格（404 EH・`/api/maps` 手書き検証の現状）

### 2.3 W-01 ベースライン（着手前に通す）

別ターミナルで backend を起動した状態で実行する。

```bash
cd /path/to/ft_Transcendence   # 自分の clone パスに置き換え
npm run typecheck
```

```bash
# ターミナル A: backend 起動
npm run dev:backend
```

```bash
# ターミナル B: 疎通（HTTP 200 + JSON）
export BASE="${BASE:-http://127.0.0.1:3000}"
curl -sS "$BASE/api/health"
```

期待: `{"status":"ok","service":"ft-transcendence-backend","time":"..."}`

- [ ] `npm run typecheck` が通る
- [ ] `GET /api/health` が 200
- [ ] `npm run check:lobby` が通る（W-02 で既存 WS を壊していないことの安全網。初回はベースライン記録のみでも可）

### 2.4 スロット 1（Spike）で決めてからコードを書くこと

- [ ] `fastify-type-provider-zod` と `@fastify/rate-limit` を使う方針を決めた
- [ ] 新規ファイルの置き場を決めた（例: `app/shared/src/api/`、`app/backend/src/plugins/`）
- [ ] レート制限の tier を ③§1-C の表どおりに写すメモを取った
- [ ] pino redact 対象（password / token / cookie 等）を ③§4「秘密情報ゼロ」と照合した

---

## 3. スロット別完了チェック（実装中）

| スロット | 完了の目安 |
|---|---|
| **1** Spike | 上記 §2.4 がすべて決定済み |
| **2** pino | `buildServer` が logger オプション付き。リクエストログに Cookie 生値・パスワードが出ない |
| **3** グローバル EH | 未捕捉例外 → 500 + `internal_error` エンベロープ。Zod 系 → 400 + `validation_failed` |
| **4** zod パイプライン | `shared` 側に API 用 zod の export 骨格。Fastify に type-provider 接続 |
| **5** `/api/maps` | クエリ検証が zod パイプライン経由（手書き `if` を置き換え） |
| **6** レート制限 | GET 120/min・変更系 30/min・auth 5/min の設定がコード上存在 |
| **7** curl 受入 | 下記 §5 の **W-02 完了時** 項目がすべて PASS |

---

## 4. curl 共通設定

```bash
export BASE="${BASE:-http://127.0.0.1:3000}"
```

`BACKEND_PORT` を変えている場合:

```bash
export BASE="http://127.0.0.1:${BACKEND_PORT:-3000}"
```

### 4.1 エンベロープ形の確認ヘルパ（任意・jq 使用）

```bash
# 用法: check_envelope "$(curl -sS "$BASE/...")"
check_envelope() {
  echo "$1" | jq -e '.error.code != null and .error.msg != null' >/dev/null \
    && echo "OK: error envelope shape" \
    || { echo "NG: missing error.code or error.msg"; echo "$1"; return 1; }
}
```

jq が無い場合は、目視で `"error":{"code":...,"msg":...}` を確認する。

---

## 5. curl 受入コマンド

### 5.1 ベースライン（W-01 済み・着手前）

**404 — `not_found` エンベロープ**

```bash
curl -sS -w "\nHTTP:%{http_code}\n" "$BASE/api/this-route-does-not-exist"
```

| 確認 | 期待 |
|---|---|
| HTTP | `404` |
| body | `"code":"not_found"` を含む |
| 形 | `{ "error": { "code", "msg" } }` |

**400 — `validation_failed`（`/api/maps` クエリ）**

```bash
curl -sS -w "\nHTTP:%{http_code}\n" "$BASE/api/maps?mode=not_a_valid_mode"
```

| 確認 | 期待 |
|---|---|
| HTTP | `400` |
| body | `"code":"validation_failed"` |

**200 — 正常系（退行確認）**

```bash
curl -sS -w "\nHTTP:%{http_code}\n" "$BASE/api/maps"
curl -sS -w "\nHTTP:%{http_code}\n" "$BASE/api/maps?mode=rsp"
```

| 確認 | 期待 |
|---|---|
| HTTP | `200` |
| body | マップ配列 JSON（空配列でなければ OK） |

---

### 5.2 W-02 完了時（スロット 7 — 必須 PASS）

スロット 2〜6 実装後に再実行する。

#### A. 400 — zod パイプライン経由の検証エラー

```bash
curl -sS -w "\nHTTP:%{http_code}\n" "$BASE/api/maps?mode=invalid"
```

| 確認 | 期待 |
|---|---|
| HTTP | `400` |
| code | `validation_failed` |
| details | W-02 で zod パイプライン化した場合、**フィールド別 `details` があると望ましい**（③§1-A。無くても `code`+`msg` は必須） |

#### B. 404 — グローバル EH との整合（退行なし）

```bash
curl -sS -w "\nHTTP:%{http_code}\n" "$BASE/api/no-such"
```

期待: スロット 3 後も **404 + `not_found` エンベロープ**（plain text や HTML にならない）。

#### C. 429 — GET 系レート制限（120 回/分）

```bash
got429=0
for i in $(seq 1 125); do
  code=$(curl -sS -o /tmp/w02_rl_body.txt -w "%{http_code}" "$BASE/api/health")
  if [ "$code" = "429" ]; then
    echo "429 at request $i"
    cat /tmp/w02_rl_body.txt
    got429=1
    break
  fi
done
[ "$got429" = 1 ] || { echo "NG: 125 回以内に 429 が来なかった"; exit 1; }
check_envelope "$(cat /tmp/w02_rl_body.txt)"
```

| 確認 | 期待 |
|---|---|
| HTTP | 上限超過後 **`429`** |
| code | `rate_limited` |

> 直前に他の curl 受入を連続実行しているとカウントが混ざる。**429 テストは単独実行**するか、1 分待ってから行う。

#### D. 429 — auth 系（5 回/分）— W-04 連携追試

W-02 時点では `/api/auth/*` が未実装のことが多い。スロット 6 では **プラグインに auth 用 tier を登録**し、W-04 でエンドポイント追加後に以下で追試する。

```bash
# W-04 着地後に実行
for i in $(seq 1 7); do
  code=$(curl -sS -o /tmp/w02_auth_rl.txt -w "%{http_code}" \
    -X POST "$BASE/api/auth/login" \
    -H 'Content-Type: application/json' \
    -d '{"email":"nobody@example.com","password":"wrong-password-12"}')
  echo "attempt $i -> HTTP $code"
  [ "$code" = "429" ] && break
done
grep -q '"rate_limited"' /tmp/w02_auth_rl.txt && echo "OK: rate_limited"
```

| 確認 | 期待 |
|---|---|
| 6 回目以降 | HTTP **429**（5 回/分/IP） |
| body | `rate_limited` |

W-02 スロット 7 だけで PASS させる最小セットは **A + B + C**。D は W-04 後の追試として記録する。

#### E. 500 — `internal_error`（任意・スロット 3 確認）

意図的に例外を起こす専用ルートは W-02 必須ではない。グローバル EH 実装時に **開発中だけ** 確認した場合の期待形:

```json
{ "error": { "code": "internal_error", "msg": "..." } }
```

本番コードに debug ルートを残さないこと。

---

### 5.3 W-02 完了チェックリスト（スロット 7 終了時）

- [ ] **A** 不正クエリ → 400 + `validation_failed` エンベロープ
- [ ] **B** 未定義ルート → 404 + `not_found` エンベロープ
- [ ] **C** GET 連打 → 429 + `rate_limited` エンベロープ
- [ ] **D** auth 429 は W-04 後追試としてメモ（または W-04 前に stub ルートで確認済み）
- [ ] `npm run typecheck` 退行なし
- [ ] `npm run check:lobby` 退行なし（可能なら）
- [ ] backend ログにパスワード・生 Cookie・生 session token が出ていない（pino redact）

---

## 6. スロット 1〜7 早見表

| # | 作業 | 終了時に叩く curl |
|---|---|---|
| 1 | Spike | （なし — §2.4 チェック） |
| 2 | pino | ログ目視 |
| 3 | グローバル EH | §5.1 404 + §5.2 B |
| 4 | zod パイプライン | §5.2 A（details 確認） |
| 5 | `/api/maps` 移行 | §5.1 200 正常系 + §5.2 A |
| 6 | レート制限 | §5.2 C（+ D は W-04 後） |
| 7 | 受入 | §5.3 全項目 |

---

## 7. 正本リンク

| 資料 | 用途 |
|---|---|
| [03 REST_API設計 §1](../02_設計書/3-REST_API設計.md) | エンベロープ・レート制限 |
| [05 バックログ W-02](../02_設計書/5-バックログ.md) | Issue 受入 |
| [torinoue_用語集 §7.14](../torinoue/torinoue_用語集.md) | Fastify / pino / zod |
| `app/shared/src/error.ts` | エンベロープ実装 |
| `app/backend/src/index.ts` | 編集の主戦場 |

---

## 8. 後日更新

| 日付 | 内容 |
|---|---|
| 2026-07-30 | 初版（W-02 着手チェック + curl 受入） |
