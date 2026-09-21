import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import {
	fpsForfeitResultPreview,
	fpsGoalResultPreview,
} from '../game/resultPreviewFixture.js';
import { MatchEndModal } from '../game/hud/MatchEndModal.js';

// 開発時に FPS の実プレイをせずリザルトを目視する入口。
// 本番 HUD と同一の MatchEndModal へ fixture を渡すため、表示実装は複製しない
export default function ResultPreviewPage({ variant }: { variant: 'goal' | 'forfeit' }) {
	const navigate = useNavigate();
	const onReturnToLobby = useCallback(() => navigate('/lobby'), [navigate]);
	const end = variant === 'forfeit' ? fpsForfeitResultPreview : fpsGoalResultPreview;

	return (
		<MatchEndModal
			end={end}
			mode="fps"
			matchDetails={null}
			detailsError={false}
			onReturnToLobby={onReturnToLobby}
		/>
	);
}
