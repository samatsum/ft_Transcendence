const FINISHED_ROOM_PREFIX = 'ft:finished-game-room:';

type ReadableStorage = Pick<Storage, 'getItem'>;
type WritableStorage = Pick<Storage, 'setItem'>;

function finishedRoomKey(roomId: string): string {
	return `${FINISHED_ROOM_PREFIX}${roomId}`;
}

/** match_end を受信したルームを、このタブの再読み込み後も判別できるようにする */
export function markGameRoomFinished(
	roomId: string,
	storage: WritableStorage = window.sessionStorage,
): void {
	try {
		storage.setItem(finishedRoomKey(roomId), '1');
	} catch {
		// sessionStorage が無効でも、WS close によるロビー遷移をフォールバックにする
	}
}

/** 終了済みなら GameView を描画せず、ルート段階でロビーへ戻す */
export function isGameRoomFinished(
	roomId: string,
	storage: ReadableStorage = window.sessionStorage,
): boolean {
	try {
		return storage.getItem(finishedRoomKey(roomId)) === '1';
	} catch {
		return false;
	}
}
