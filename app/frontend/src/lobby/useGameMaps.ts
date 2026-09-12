import { useEffect, useState } from 'react';

import { listMapsResponseSchema, type LobbyMode } from '@ft/shared';

import { isAbortError } from '../api/apiFetch.js';
import { useApi } from '../api/useApi.js';
import type { GameMapOption } from './gameCustomization.js';

export type GameMapsStatus = 'idle' | 'loading' | 'ready' | 'error';

interface GameMapsState {
	mode: LobbyMode | null;
	maps: GameMapOption[];
	status: GameMapsStatus;
}

/** モード別マップ一覧を取得し、前のモードの遅延結果を破棄する */
export function useGameMaps(mode: LobbyMode | null): Omit<GameMapsState, 'mode'> {
	const { get } = useApi();
	const [state, setState] = useState<GameMapsState>({ mode: null, maps: [], status: 'idle' });

	useEffect(() => {
		if (!mode) {
			setState({ mode: null, maps: [], status: 'idle' });
			return;
		}
		const controller = new AbortController();
		setState({ mode, maps: [], status: 'loading' });
		void get(`/api/maps?mode=${mode}`, {
			schema: listMapsResponseSchema,
			signal: controller.signal,
			toast: false,
		})
			.then((maps) => {
				if (!controller.signal.aborted) setState({ mode, maps, status: 'ready' });
			})
			.catch((error: unknown) => {
				if (!isAbortError(error)) setState({ mode, maps: [], status: 'error' });
			});
		return () => controller.abort();
	}, [get, mode]);

	if (state.mode !== mode) {
		return { maps: [], status: mode ? 'loading' : 'idle' };
	}
	return { maps: state.maps, status: state.status };
}
