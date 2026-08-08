// GameView（/game/:roomId）— GV-06 + GV-07 の統合先。
// ② §5 のゲーム WS + render.wasm + snapshot 補間 + 30Hz 入力送信 + HUD 8要素を組む。
// マッチ遷移フロー（match_end → /lobby ボタン → auto navigate）は GV-08 の担当

import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { WS_CLOSE } from '@ft/shared';
import { z } from 'zod';

import { useApi } from '../api/useApi.js';
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

	const { localYawRef, setOnCaptureChange } = useGameInput({
		canvasRef,
		send,
		spectator: !!isSpectator,
		enabled: rendererEnabled && canSend,
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
						<p className="rounded bg-black/60 px-4 py-2 text-sm">
							エンジンを読み込んでいます…
						</p>
					)}
					{rendererStatus === 'loading-textures' && textureProgress && (
						<p className="rounded bg-black/60 px-4 py-2 text-sm">
							テクスチャ {textureProgress.loaded}/{textureProgress.total}
						</p>
					)}
					{rendererStatus === 'error' && (
						<p className="rounded bg-rose-900/80 px-4 py-2 text-sm">
							描画エラー: {errorMessage}
						</p>
					)}
					{rendererStatus === 'ready' && !captured && !isSpectator && (
						<p className="rounded bg-black/60 px-4 py-2 text-sm">
							クリック / Enter でキャプチャ開始、Esc で解除
						</p>
					)}
					{rendererStatus === 'ready' && isSpectator && (
						<p className="rounded bg-black/60 px-4 py-2 text-sm">
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
			</div>

			<footer className="flex w-full max-w-[1280px] items-center justify-between text-xs text-slate-400">
				<span>
					room={roomId} · view={welcome?.combatant_id ?? '-'} · slot={welcome?.slot ?? '-'}
				</span>
				<span>{fps} fps</span>
			</footer>
		</main>
	);
}
