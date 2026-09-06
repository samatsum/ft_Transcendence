// GameView（/game/:roomId）— GV-06 + GV-07 の統合先。
// ② §5 のゲーム WS + render.wasm + snapshot 補間 + 30Hz 入力送信 + HUD 8要素を組む。
// マッチ遷移フロー（match_end → /lobby ボタン → auto navigate）は GV-08 の担当

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { WS_CLOSE } from '@ft/shared';
import { z } from 'zod';

import { useApi } from '../api/useApi.js';
import { ExitPromptModal } from '../game/hud/ExitPromptModal.js';
import { HudOverlay } from '../game/hud/HudOverlay.js';
import type { MatchDetailsView } from '../game/hud/MatchEndModal.js';
import { useEngineRenderer } from '../game/useEngineRenderer.js';
import { useGameInput } from '../game/useGameInput.js';
import { useGameSocket } from '../game/useGameSocket.js';

// GV-07 推奨決定#4: match_end で /api/matches/:id を toast:false で取り試合詳細を表示。
// shared/api/matches.ts の正式スキーマは B-13 で確定するため、暫定 schema をここに置く
const matchDetailsSchema = z.object({
	players: z.array(
		z.object({
			display_name: z.string(),
			is_ai: z.boolean(),
			team: z.number(),
			slot: z.number(),
			result: z.enum(['win', 'lose', 'draw', 'abandon']),
		}),
	),
});

export default function GameView() {
	const { roomId = '' } = useParams();
	const navigate = useNavigate();
	const canvasRef = useRef<HTMLCanvasElement | null>(null);
	const [captured, setCaptured] = useState(false);

	const {
		status,
		welcome,
		snapshotBufferRef,
		lastEvent,
		playerStatus,
		closeCode,
		canSend,
		send,
	} = useGameSocket(roomId);

	const isSpectator = welcome?.role === 'spectator';
	const rendererEnabled = welcome !== null;

	// #113 退出ポップアップ。Esc で開き、y / ボタンで確定、もう一度 Esc で閉じる。
	// **表示中も送信ループは止めない**（enabled をそのままにしておく）。止めると
	// 入力が完全に途絶えるだけで、棒立ちの表現としてはキャプチャ解除で足りる
	const [exitPromptOpen, setExitPromptOpen] = useState(false);
	// 決着後は結果モーダル（MatchEndModal）が出ているので、その上に退出ポップアップを
	// 重ねない。この状態の Esc は Modal 側のハンドラに任せる＝「ロビーへ戻る」になる
	const [matchEnded, setMatchEnded] = useState(false);
	const onRequestExit = useCallback(() => {
		if (matchEnded) return;
		setExitPromptOpen(true);
	}, [matchEnded]);

	const { localYawRef, setOnCaptureChange } = useGameInput({
		canvasRef,
		send,
		spectator: !!isSpectator,
		enabled: rendererEnabled && canSend,
		onRequestExit,
	});

	useEffect(() => {
		setOnCaptureChange((c) => setCaptured(c));
		return () => setOnCaptureChange(null);
	}, [setOnCaptureChange]);

	const { status: rendererStatus, textureProgress, errorMessage, fps } = useEngineRenderer({
		canvasRef,
		welcome,
		snapshotBufferRef,
		localYawRef,
	});

	// 決着したら退出ポップアップを閉じ、以後 Esc では開かないようにする。
	// **match_id が null でも決着は決着**なので、下の詳細取得とは別の effect にする
	// （あちらは match_id === null で早期 return する）
	useEffect(() => {
		if (lastEvent?.kind !== 'match_end') return;
		setMatchEnded(true);
		setExitPromptOpen(false);
	}, [lastEvent]);

	// match_end の match_id で試合詳細取得(GV-07 推奨決定#4)。
	// B-13 未実装期間は失敗する前提なので toast:false + error state で握る
	const api = useApi();
	const [matchDetails, setMatchDetails] = useState<MatchDetailsView | null>(null);
	const [matchDetailsError, setMatchDetailsError] = useState(false);
	useEffect(() => {
		if (!lastEvent || lastEvent.kind !== 'match_end') return;
		const matchId = lastEvent.match_id;
		if (matchId === null) return;
		let cancelled = false;
		api
			.get<MatchDetailsView>(`/api/matches/${matchId}`, {
				schema: matchDetailsSchema,
				toast: false,
			})
			.then((details) => {
				if (!cancelled) setMatchDetails(details);
			})
			.catch(() => {
				if (!cancelled) setMatchDetailsError(true);
			});
		return () => {
			cancelled = true;
		};
	}, [lastEvent, api]);

	// close 1000/4002 でロビーへ戻す(GV-08 で match_end モーダル → 明示遷移が主。
	// ここは close 到達時の自動フォールバック)
	useEffect(() => {
		if (closeCode === WS_CLOSE.normal || closeCode === WS_CLOSE.roomNotFound) {
			const id = setTimeout(() => navigate('/'), 800);
			return () => clearTimeout(id);
		}
		return undefined;
	}, [closeCode, navigate]);

	const onReturnToLobby = useCallback(() => navigate('/lobby'), [navigate]);

	// #113 退出確定。② §5-A の leave を送ってからロビーへ。サーバは席を復帰不能な
	// AI 席へ移し、FPS なら forfeit にする（room.ts の「明示leave」）。socket は
	// サーバ側で閉じないので、遷移に伴う unmount で 1000 close される
	const onConfirmExit = useCallback(() => {
		send({ t: 'leave', d: {} });
		setExitPromptOpen(false);
		navigate('/lobby');
	}, [send, navigate]);
	const onCancelExit = useCallback(() => setExitPromptOpen(false), []);

	return (
		<main className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-950 p-2 text-slate-100">
			<div className="relative w-full max-w-[1280px] aspect-video bg-black">
				<canvas
					ref={canvasRef}
					tabIndex={0}
					className="block h-full w-full outline-none"
					style={{ imageRendering: 'pixelated' }}
					aria-label="game view"
				/>

				{/* 読み込み中と描画エラーは HUD 前に出す(HUD は welcome 後にしか描かない) */}
				<div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
					{rendererStatus === 'loading-glue' && (
						<p className="rounded bg-black/60 px-4 py-2 text-body">
							エンジンを読み込んでいます…
						</p>
					)}
					{rendererStatus === 'loading-textures' && textureProgress && (
						<p className="rounded bg-black/60 px-4 py-2 text-body">
							テクスチャ {textureProgress.loaded}/{textureProgress.total}
						</p>
					)}
					{rendererStatus === 'error' && (
						<p className="rounded bg-rose-900/80 px-4 py-2 text-body">
							描画エラー: {errorMessage}
						</p>
					)}
					{/* モバイル幅ではキャプチャできないので操作ヒント自体を出さない（④ D-13） */}
					{rendererStatus === 'ready' && !captured && !isSpectator && (
						<p className="hidden rounded bg-black/60 px-4 py-2 text-body md:block">
							クリック / Enter でキャプチャ開始、Esc で退出メニュー
						</p>
					)}
					{rendererStatus === 'ready' && isSpectator && (
						<p className="rounded bg-black/60 px-4 py-2 text-body">
							観戦中(視点切替は GV-12)
						</p>
					)}
				</div>

				{/* GV-07 HUD 8要素 */}
				<HudOverlay
					welcome={welcome}
					snapshotBufferRef={snapshotBufferRef}
					lastEvent={lastEvent}
					playerStatus={playerStatus}
					connectionStatus={status}
					closeCode={closeCode}
					matchDetails={matchDetails}
					matchDetailsError={matchDetailsError}
					onReturnToLobby={onReturnToLobby}
				/>

				{/* #113 退出ポップアップ。Modal が portal で body 直下に描くので、
				    ここに置いても canvas の重なり順には影響しない */}
				<ExitPromptModal
					open={exitPromptOpen}
					onConfirm={onConfirmExit}
					onCancel={onCancelExit}
				/>
			</div>

			{/* ④ D-13: モバイル幅は「キーボード必須」を告知して閲覧のみとする。
			    課題書 III.3 の「2つの画面サイズで崩れない」はモジュール点ではなく必須要件。
			    matchMedia ではなく CSS の md ブレークポイントで出し分ける
			    （リサイズ・画面回転で状態がずれず、初回描画で一瞬ちらつくこともない） */}
			<p className="w-full max-w-[1280px] rounded bg-amber-500/90 px-3 py-2 text-center text-caption text-slate-950 md:hidden">
				操作にはキーボードが必要です。この画面幅では観戦のみになります。
			</p>

			<footer className="flex w-full max-w-[1280px] flex-wrap items-center justify-between gap-x-3 text-caption text-slate-400">
				<span>
					room={roomId} · view={welcome?.combatant_id ?? '-'} · slot={welcome?.slot ?? '-'}
				</span>
				<span>{fps} fps</span>
			</footer>
		</main>
	);
}
