# GATE1_REPORT — cub3D Engine Separation Spike E-01..E-07

## 判定

**判定: go**

根拠:

- ユーザー目視確認（2026-07-11 JST）: `http://localhost:8000/web/gate1.html` を Windows 側 Chrome で開き、Canvas に画面が表示された。
- ユーザー確認: DevTools Console に error らしき表示なし。
- E-07 は「静的マップ1枚の Canvas 描画」がゲート条件であり、入力操作は E-08 の範囲。操作できないことは GATE1 no-go 要因ではない。
- headless 自己検証: `render.wasm` のロード、全テクスチャ登録、`web_init()`、`web_render()`、フレームバッファ非空を確認済み。

## 確認環境

- 作業ブランチ: `feature/engine-separation-spike`
- native dependency: `gcc`, `make`, X11 開発ヘッダ確認済み
- `DISPLAY=:0`
- Emscripten: `emcc 6.0.2`
- 配信方法: リポジトリ直下で `python3 -m http.server 8000`
- 確認 URL: `http://localhost:8000/web/gate1.html`

## 性能実測

- 内部解像度: **960x540**
- wasm/headless 120 フレーム実測: **120 frames / 1321.887 ms = 90.78 fps**
- フレームバッファ: width 960, height 540, stride 3840
- フレームバッファ非ゼロバイト数: 1,480,294
- web 登録テクスチャ数: 99

補足: Chrome 画面上の fps 数値はユーザーから未回収。上記 fps は Node 上で同一 `render.wasm` を実行した headless 測定値。

## E-01..E-07 受入条件

| Issue | 結果 | チェック内容 |
|---|---|---|
| E-01 | OK | `codes/includes/platform/platform.h` を追加し、`pf_*` IF と `t_framebuffer` を定義。 |
| E-02 | OK | native platform 層を `codes/srcs/platform/native/` に追加。MLX 直接呼び出しは native platform に集約。`common/fps/rsp/includes` の `mlx.h` include はゼロ。 |
| E-03 | OK | `t_window.screen` を `t_framebuffer` 化し、`draw_pixel` / 壁描画 / BMP 読み出しを `pixels` + `stride` 参照へ差し替え。 |
| E-04 | OK | `game_step(game, dt)` と `game_frame(game, dt)` を追加。1フレーム更新関数は描画・転送・時刻取得・sleep を含まない。native は `mlx_loop_hook` から dt を渡す構造。 |
| E-05 | OK | `make web` ターゲットを追加し、`web/build/render.wasm` を生成。`-O2`、memory growth 有効、web は pthread 不使用。 |
| E-06 | OK | `codes/PythonCodes/xpm_to_tex.py` を追加。XPM 99 枚を `.tex`（RGBA）へ変換し、manifest から web 側へ供給。壁/オブジェクト/敵8方向/ハンド6枚/武器/死亡画面/ゴール/扉を含む。 |
| E-07 | OK | `web/gate1.html` + `web/gate1.js` を追加。JS 側で WASM フレームバッファを Canvas ImageData へ BGRA→RGBA 変換して表示。ユーザー目視で描画成功、Console error なし。 |

## 実行済み検証

- `make` 成功
- `make check` 成功
- `make -B web` 成功
- `timeout 3s ./cub3D maps/fps_map/1.cub`: 起動・フレーム更新・クラッシュなし
- `timeout 3s ./cub3D maps/rsp_map/rsp.cub`: 起動・フレーム更新・クラッシュなし
- Node headless wasm 検証: `web_init()` / `web_render()` 成功、非ゼロバイト 1,480,294
- Chrome 目視: 描画成功、Console error なし（ユーザー確認）

## 設計書との乖離・申し送り

- `.cub` のメモリリーダ化は E-09 範囲のため未実施。GATE1 web では Emscripten の preload FS に `maps/fps_map/1.cub` を載せて `parse_config` を再利用した。
- `pf_load_texture` は設計書 §2 の `pf_load_texture(id)` ではなく、GATE1 実装では `pf_load_texture(window, tex)` のパスベース契約を残した。web 側は `.cub` / asset loader が持つパス文字列を `manifest.json` のキーとして照合する。E-08/E-09 以降で「設計どおり ID 化する」か「パス契約を正式仕様に格上げする」かを決める。
- `pf_*` の web 実装は、レビュー後の追補で `web_pf_*` / `-Dpf_*=web_pf_*` の振り替えを廃止し、native/web が同じ `pf_*` 名を実装する形へ揃えた。lint の CR013 は `codes/srcs/platform/*/` 配下の `pf_*` target 別実装だけを重複許容する。
- web 入力は E-08 範囲のため未実装。静的描画ゲートでは操作不可で問題なし。
- Chrome の resizable `ArrayBuffer` と Emscripten 6.0.2 の `TextDecoder.decode()` の相性で一度 Console error が発生した。GATE1 では `TEXTDECODER=1` と `gate1.html` の shim で回避した。E-08 以降では Emscripten 側の推奨設定確認か、生成 JS の安定化方針を再検討する。
- 変換済み `.tex` は約 212MB になるため git 管理外（`web/assets/` ignored）。配信前に `make web` または `make web-assets` が必要。初回ロードは全99枚を直列 fetch しているため、E-08 以降でマップが要求するテクスチャだけを読む形へ絞ると体感改善が見込める。
- XPM の透明色は web 変換時に `alpha == 0` を `0x000000` として扱うため、不透明な純黒と区別できない。native の XPM `None` 表現との完全一致は未検証で、黒を含むスプライトを増やす前に確認する。
- native 回帰は起動・クラッシュなしまで確認。プレイ感の詳細な人間操作確認は未実施。
- web はシングルスレッド固定。既存 pthread 並列レンダラは native 専用として維持。
- `PROFILE` 計測は既存挙動として毎フレーム stdout / console に出る可能性がある。E-08 以降、web build では無効化して DevTools Console を静かに保つ。

## no-go 時の障壁

該当なし。GATE1 は go 判定。
