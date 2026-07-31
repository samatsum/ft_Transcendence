// GameView（/game/:roomId）— F-06 の統合先。
// ② §5 のゲーム WS + render.wasm + snapshot 補間 + 30Hz 入力送信を組む。
// HUD（スコア・countdown・切断バッジ）は F-07 の担当なので、ここでは
// 読み込み進捗・接続状態・切断バナー・fps のみを最小オーバーレイで出す。
// マッチ遷移フロー（match_end → /lobby）は F-08 の担当。

import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { WS_CLOSE } from '@ft/shared';

import { useGameSocket } from '../game/useGameSocket.js';
import { useGameInput } from '../game/useGameInput.js';
import { useEngineRenderer } from '../game/useEngineRenderer.js';

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

	// close 1000（正常）や 4002（ルーム消滅）でロビーへ戻す。
	// match_end 後の60秒待ちは Backend が保持するので、ここでは close を待ってから遷移。
	useEffect(() => {
		if (closeCode === WS_CLOSE.normal || closeCode === WS_CLOSE.roomNotFound) {
			const id = setTimeout(() => navigate('/'), 800);
			return () => clearTimeout(id);
		}
		return undefined;
	}, [closeCode, navigate]);

	const showBanner = status === 'reconnecting' || status === 'connecting';

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

				{/* 読み込み・エラー・キャプチャ案内の最小オーバーレイ（HUD は F-07） */}
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
					{rendererStatus === 'ready' && !captured && (
						<p className="rounded bg-black/60 px-4 py-2 text-sm">
							{isSpectator
								? '観戦中(視点切替は F-12)'
								: 'クリックで操作開始 / Esc で解除'}
						</p>
					)}
					{showBanner && (
						<p className="rounded bg-amber-900/80 px-4 py-2 text-sm">
							{status === 'connecting' ? '接続中…' : '再接続中…'}
						</p>
					)}
					{closeCode !== null && closeCode !== WS_CLOSE.normal && (
						<p className="rounded bg-rose-900/80 px-4 py-2 text-sm">
							切断されました (code={closeCode})
						</p>
					)}
				</div>
			</div>

			<footer className="flex w-full max-w-[1280px] items-center justify-between text-xs text-slate-400">
				<span>
					room={roomId} · ws={status} · view={welcome?.combatant_id ?? '-'}
					{playerStatus.size > 0 && (
						<span> · players=[
							{Array.from(playerStatus.entries())
								.map(([slot, state]) => `${slot}:${state}`)
								.join(', ')}
							]
						</span>
					)}
					{lastEvent && <span> · last={lastEvent.kind}</span>}
				</span>
				<span>{fps} fps</span>
			</footer>
		</main>
	);
}
