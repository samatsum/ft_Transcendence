import { useEffect } from 'react';
import type { GameEvent, PlayerStatusMessage, WelcomeMessage } from '@ft/shared';

import { useToast } from '../../contexts/ToastContext.js';
import { useHudState } from '../useHudState.js';
import type { GameSocketStatus, TimedSnapshot } from '../useGameSocket.js';
import { ConnectionBanner } from './ConnectionBanner.js';
import { Countdown } from './Countdown.js';
import { MatchEndModal, type MatchDetailsView } from './MatchEndModal.js';
import { PlayerStatusRow } from './PlayerStatusRow.js';
import { ScoreBar } from './ScoreBar.js';
import { ScreenEdgeFlash } from './ScreenEdgeFlash.js';

// GV-07 HUD 統合。GameView から呼ばれ、useGameSocket が公開する
// welcome / snapshot / lastEvent / playerStatus / closeCode / status を
// 8要素の HUD へ配線する。
//
// - スコア/フラッシュ/countdown/match_end は useHudState で派生
// - 対戦者ステータス行は snapshot 初期 + playerStatus(WS メッセージ)のマージ
// - 接続バナーは useGameSocket.status を直接見る
// - match_end 後の詳細取得は GameView(useApi 経由)。ここでは受け皿だけ

interface HudOverlayProps {
	welcome: WelcomeMessage['d'] | null;
	snapshotBufferRef: { current: TimedSnapshot[] };
	lastEvent: GameEvent['d'] | null;
	playerStatus: Map<number, PlayerStatusMessage['d']['state']>;
	connectionStatus: GameSocketStatus;
	closeCode: number | null;
	matchDetails: MatchDetailsView | null;
	matchDetailsError: boolean;
	onReturnToLobby: () => void;
}

export function HudOverlay({
	welcome,
	snapshotBufferRef,
	lastEvent,
	playerStatus,
	connectionStatus,
	closeCode,
	matchDetails,
	matchDetailsError,
	onReturnToLobby,
}: HudOverlayProps) {
	const hud = useHudState({ welcome, snapshotBufferRef, lastEvent });

	// useGameSocket の playerStatus(Map) は useHudState の seats と別経路で更新される。
	// event 経路(player_disconnected/reconnected/ai_takeover)は useHudState が拾い、
	// ここは player_status 単体メッセージのマージだけ担う(useHudState の state に
	// 混ぜず、描画時に上書きの形で反映する)
	const mergedSeats = new Map(hud.seats);
	playerStatus.forEach((state, slot) => {
		const prev = mergedSeats.get(slot);
		if (prev && prev.state !== state) {
			mergedSeats.set(slot, { ...prev, state, graceDeadlineMs: null });
		} else if (!prev) {
			mergedSeats.set(slot, {
				slot,
				name: `Player ${slot}`,
				state,
				graceDeadlineMs: null,
			});
		}
	});

	// welcome.resume=true で「復帰しました」トースト(④ §3.3 の要件)
	const { push } = useToast();
	useEffect(() => {
		if (welcome?.resume) {
			push({ kind: 'success', message: '対戦に復帰しました', timeoutMs: 2500 });
		}
	}, [welcome, push]);

	if (!welcome) {
		// welcome 前は HUD を出さない(GameView の読み込みオーバーレイに任せる)
		return null;
	}

	return (
		<>
			<ScoreBar
				mode={welcome.mode}
				score={hud.score}
				targetScore={welcome.rules.target_score}
				highlightTeam={hud.pointFlash?.team ?? null}
			/>
			<PlayerStatusRow seats={mergedSeats} selfSlot={welcome.slot} />
			<ScreenEdgeFlash
				pointTeam={hud.pointFlash?.team ?? null}
				handChanged={hud.handFlash?.hand ?? null}
			/>
			<Countdown seconds={hud.countdownSeconds} />
			<ConnectionBanner status={connectionStatus} closeCode={closeCode} />
			{hud.matchEnd && (
				<MatchEndModal
					end={hud.matchEnd}
					mode={welcome.mode}
					matchDetails={matchDetails}
					detailsError={matchDetailsError}
					onReturnToLobby={onReturnToLobby}
				/>
			)}
		</>
	);
}

