# F-02 — fetch ラッパ + shared zod 接続 + Toast 連携

**位置づけ**: [5-バックログ §5](../02_設計書/5-バックログ.md) の F-02 行を、
ファイル別に展開した実装レポート。上流工程レビュー(2026-07-31 samatsum)の結果と、
本作業で確定した4つのローカル決定を反映済み。契約の正本は
[③ REST_API §1](../02_設計書/3-REST_API設計.md) と
[④ フロントエンド設計 §2](../02_設計書/4-フロントエンド設計.md)。
両者と食い違ったら本書ではなく設計書を先に直す。

作成: 2026-07-31 ／ 担当: **samatsum**(本来 mamiyaza 主担当だが連絡不通のため代行)

---

## 0. 一言でいうと

F-03/F-05/F-09 が backend REST を叩くときの共通経路。次を提供する。

- `apiFetch()` — React 依存無しの純関数(vitest からも呼べる)。Cookie 認証・JSON serialize・エラーエンベロープ解釈・zod 検証を一箇所に集約
- `useApi()` — hook。Toast / AuthContext / navigate と結合し、401 で `/login` へ復帰 URL 付きリダイレクト、他は既定で Toast
- `ApiError` — 3系統(network_error / invalid_response / envelope の code)を統一
- `ERROR_MESSAGES_JA` — サーバ msg が空/欠落時のフォールバック日本語文言

**評価要件**: ④ §6-1「コンソール error/warning ゼロ」の実装面(発生した error を全て Toast へ流し、`code` は開発ログのみ)。⑤ F-02 受入「401 で /login、エラーがトーストに出る」。

---

## 1. 依存

| 依存 | 状態 | 影響 |
|---|---|---|
| **F-01** SPA 雛形(ToastContext / AuthContext / RequireAuth) | ✅ 実装済み([PR #33](https://github.com/samatsum/ft_Transcendence/pull/33)) | useApi の副作用配線先 |
| **shared/error.ts** | ✅ 完了(samatsum W-01 時) | `errorEnvelopeSchema` / `ErrorCode` を消費 |
| **W-02** Fastify + エラーハンドラ | 未着手(torinoue) | `msg` の日本語化と正確な `code` 発火は W-02 完了時に確定 |
| **W-04** 認証 API | 未着手(torinoue) | 実 backend との 401 チェーン確認は W-04 完成後 |
| **shared/api/** の zod スキーマ | 未着手(torinoue W-02 で追加) | F-02 は schema を optional 引数で受けるので依存しない |

---

## 2. 上流工程レビューで見つけた穴と、確定した決定(2026-07-31)

| # | 穴 | 決定 |
|---|---|---|
| 1 | 401 応答時のリダイレクト後の元 URL 復帰方針 | **401 でも `state.from` に元 URL を積んで `/login` へ navigate**。F-01 の RequireAuth と同じ契約。ログイン後に元ページへ戻す。Toast は出さない(redirect が feedback として十分) |
| 2 | Toast に出すメッセージの言語・優先順位 | **サーバの `msg` を優先**。空/欠落なら F-02 内の `code → 日本語` マップから引く。呼び出し側で `onError` により個別 override 可 |
| 3 | エラー分類の統一(3系統) | `ApiError.code: ApiErrorCode` に統一。`ApiErrorCode = ErrorCode \| 'network_error' \| 'invalid_response'`。network 失敗と非 JSON / envelope 不一致 / schema 不一致は `invalid_response` に丸め、Toast の統一路へ |
| 4 | クライアントの形 | **`useApi()` フックが `{ request, get, post, put, patch, del }` を返す**(useCallback + useMemo で identity 安定)。純関数 `apiFetch()` も別途 export(vitest / hook 外の AuthContext から使う)。`/api` prefix は呼び出し側でフルパス指定 |

**上流ドキュメントに1行追記したい箇所(軽微・別 PR で)**:
- ④ §2 に「401 は `state.from` を積んで /login へ、Toast は出さない(redirect が十分な feedback)」を1行
- ④ §2 に「Toast は `msg` 優先、無ければ code の日本語マップから」を1行

---

## 3. 触ったファイル

**新規(api 層: 4 + test: 1 + doc: 1)**

| パス | 責務 |
|---|---|
| `app/frontend/src/api/apiError.ts` | `ApiError` class + `ApiErrorCode` 型(3系統統合) |
| `app/frontend/src/api/apiFetch.ts` | 純関数コア: fetch → parse → envelope → schema。`isAbortError()` helper |
| `app/frontend/src/api/errorMessages.ts` | `ERROR_MESSAGES_JA` map + `fallbackMessage()` |
| `app/frontend/src/api/useApi.ts` | hook。Toast / AuthContext / navigate と結合 |
| `app/frontend/src/api/apiFetch.test.ts` | vitest 13件 |
| `md_files/03_実装レポート/F-02_fetchラッパ.md` | 実装レポート |

**編集**

| パス | 変更内容 |
|---|---|
| `app/frontend/src/contexts/AuthContext.tsx` | 初期 `/api/auth/me` fetch を `apiFetch()` 経由に置換。logout も `apiFetch()` 経由に。暫定 zod schema を導入(W-04 完成時に shared 側へ移す) |

---

## 4. API

### `apiFetch<T>(url, options?, schema?): Promise<T>` — 純関数

- `options`: `method` / `body` / `signal` / `headers` / `json`(既定 true)
- `body` は json:true(既定) で `JSON.stringify` + `Content-Type: application/json` 自動付与。multipart は `json: false` を渡す
- `credentials: 'same-origin'` 固定(⓪ §3.1 の同一オリジン方針)
- 戻り値: schema があれば `schema.parse()` した T、無ければ raw JSON。204 は `undefined`

**throw**:
- `DOMException('AbortError')` — cancel。呼び出し側で `isAbortError()` で判定
- `ApiError` — 上記以外の失敗すべて

### `useApi(): { request, get, post, put, patch, del }` — hook

各メソッドの signature:
```ts
request<T>(url: string, opts?: UseApiCallOptions<T>): Promise<T>
get    <T>(url: string, opts?: Omit<UseApiCallOptions<T>, 'method'|'body'>): Promise<T>
post   <T>(url: string, body?: unknown, opts?: ...): Promise<T>
put    <T>(url: string, body?: unknown, opts?: ...): Promise<T>
patch  <T>(url: string, body?: unknown, opts?: ...): Promise<T>
del    <T>(url: string, opts?: Omit<...>): Promise<T>
```

`UseApiCallOptions` は `ApiFetchOptions` に以下を追加:
- `schema?: ZodType<T>` — 応答の zod 検証
- `toast?: boolean`(既定 true) — 失敗時に Toast を出すか
- `onError?: (err: ApiError) => void` — 呼び出し側で code 別ハンドリング

### `ApiError`

```ts
class ApiError extends Error {
    code: ApiErrorCode;      // ErrorCode | 'network_error' | 'invalid_response'
    status?: number;         // HTTP status(envelope 経由のとき)
    details?: Record<string, string>;  // validation エラーのフィールド別理由
}
```

---

## 5. 受入条件

**⑤ F-02**:
- ✅ 401 で `/login` へ → `useApi.request` で `unauthenticated` code を検知 → `setUser(null)` + `navigate('/login', { state: { from } })`
- ✅ エラーがトーストに出る → 既定で `push({ kind: 'error', message: err.message })`

**F-02 固有**:
- ✅ TypeScript typecheck 通過(3 workspace)
- ✅ vitest 通過(22件 = 既存 snapshot 9 + apiFetch 13)
- ✅ vite build 通過(gzip 104KB)
- ⏳ **未検証**: 実 backend との 401/500 チェーン(W-02/W-04 完成待ち)
- ⏳ **未検証**: F-03 の LoginPage が `state.from` を読んで復帰する経路(F-03 の担当)

---

## 6. レビュー観点

| 観点 | 具体 |
|---|---|
| **AuthContext 循環依存** | `AuthProvider` は `ToastProvider` の外側にあるため `useToast` を使えない。AuthContext の内部 fetch は **純関数の `apiFetch()`** を使う(useApi ではない)。401 も暗黙に `unauthenticated` を投げるが AuthContext は catch して null に丸める |
| **useApi 依存の順序** | `useNavigate` / `useLocation` は Router の内側でしか動かない。`ToastProvider` は `AuthProvider` の内側。`useAuth` は AuthProvider の内側。この3つが全部揃った Provider 階層でしか `useApi` は使えない。F-01 の main.tsx の順序で満たしている |
| **AbortError の扱い** | `apiFetch` は `AbortError` を ApiError に丸めず再スロー。`useApi` も同様に無視して再スロー。`isAbortError()` helper を提供 |
| **`code` のコンソール漏洩** | ④ §2「`code` は開発者コンソールに出さない」。現状は Toast に `msg` のみ表示、`code` は `ApiError` インスタンスの属性で保持。将来 dev-only ログを足すときは `import.meta.env.DEV` で守る |
| **shared/api/ の空白** | W-02 未着手なので schema は呼び出し側が渡す都度定義。AuthContext の `authUserSchema` は暫定で AuthContext 内に置いた。W-04 完成時に `shared/api/auth.ts` へ移動する見込み |
| **multipart 経路** | W-06 アバターアップロード等は `apiFetch(url, { body: formData, json: false })` で通せる。Content-Type は multipart の boundary をブラウザに任せるため未指定 |

---

## 7. 関連ドキュメント

- [③ §1 共通規約(エラーエンベロープ / バリデーション / レート制限)](../02_設計書/3-REST_API設計.md) — 契約の正本
- [④ D-12 状態管理決定](../02_設計書/4-フロントエンド設計.md) — 「React Query 等入れず fetch ラッパ + Context + zod」
- [④ §2 共通レイアウト(Toast / ErrorBoundary)](../02_設計書/4-フロントエンド設計.md) — Toast への流し方
- [F-01_雛形整備](./F-01_雛形整備.md) — ToastContext / AuthContext / RequireAuth
- [app/shared/src/error.ts](../../app/shared/src/error.ts) — `errorEnvelopeSchema` / `ErrorCode` / `errorStatusByCode`

---

## 8. 状態

| 項目 | 値 |
|---|---|
| ステータス | **実装コミット済み**(2026-07-31)。**実 backend との E2E は未検証**(W-02/W-04 完了待ち) |
| 担当 | **samatsum**(mamiyaza 代行) |
| クリティカルパス | いいえ(F-02 単体はゲート2 の芯ではないが、F-03/F-05/F-09 の前提) |
| 拒否条件 | 直接は該当しないが、コンソールゼロ運用の実装面を担う |
| 予定 Day | Day 1〜3(5日制)。実装コミットは 2026-07-31 |
| 検証済み | typecheck(3 workspace) / vitest 22件 / vite build(gzip 104KB) |
| 未検証 | 実 backend との 401/500 チェーン、F-03 の `state.from` 復帰、multipart 経路(W-06) |

---

## 改訂記録

| 日付 | 内容 |
|---|---|
| 2026-07-31 | 初版(実装レポート)。上流工程レビューの4決定を反映。samatsum が mamiyaza 代行で作成。F-01 PR の上に積む形 |
