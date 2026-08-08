// ② WS プロトコルの共有スキーマ（Issue #10 で配置を合意）。
//
// 所有者は samatsum（② の契約所有者）。REST 側の `api/` は torinoue が B-02 で追加する。
// `lobby.ts` は B-08 の全ロビー契約と、B-09/B-13 が使う match_result 契約を持つ。
export * from './envelope.js';
export * from './errors.js';
export * from './game.js';
export * from './lobby.js';
