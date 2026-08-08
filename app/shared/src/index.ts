// FE/BE 共有の契約（型の単一情報源）。I-01 では骨格のみを置き、実体は
// B-02（③§1 エラーエンベロープ・検証パイプライン）と B-11（② WS メッセージ）で拡張する。
// ここに置いたスキーマは frontend / backend の双方が import して使い、
// 「フロント/バック双方での検証」要件（0-全体アーキテクチャ設計 §2.4）を単一定義で満たす。
export * from './error.js';
export * from './health.js';
// ② WS プロトコル（B-08/B-11。配置は Issue #10 で合意）。REST 側の `api/` は B-02 で追加する
export * from './ws/index.js';
