import { useEffect } from 'react';

import { Button } from '../../components/Button.js';
import { Modal } from '../../components/Modal.js';

// #113 退出ポップアップ。#112 GameView の1構成要素。
//
// 開閉:
//   - Esc で開く（useGameInput の onRequestExit）。同時に入力キャプチャが解除される
//   - もう一度 Esc で閉じる（Modal 側の Esc ハンドラ → onCancel）
//   - y キー / 「退出する」ボタンで退出を確定する
//
// **表示中も WS は切らない。** 切ると B-12 の再接続猶予（30秒）が走って AI に
// 交代されてしまい、#113 が要求する「棒立ち」にならない。切らずにキャプチャだけ
// 解除しておけば、30Hz の送信ループは mv=0 を送り続ける（useGameInput の
// `const mv = capturedRef.current ? heldMvRef.current : 0`）ので、その場に立った
// まま試合が進む＝撃たれることも、じゃんけんで負けて死ぬこともある。

interface ExitPromptModalProps {
	open: boolean;
	/** 退出を確定する（GameView が leave 送信 → ロビーへ遷移） */
	onConfirm: () => void;
	/** 対戦を続ける（ポップアップを閉じるだけ） */
	onCancel: () => void;
}

export function ExitPromptModal({ open, onConfirm, onCancel }: ExitPromptModalProps) {
	// y キーでの確定。Modal は Esc しか見ないのでここで足す。
	// KeyboardEvent.key ではなく code を見るのは、配列違いのキーボードでも
	// 物理キー位置で一致させるため（HOLD_KEYS と同じ流儀）
	useEffect(() => {
		if (!open) return;
		function onKey(ev: KeyboardEvent) {
			if (ev.code !== 'KeyY') return;
			ev.preventDefault();
			onConfirm();
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	}, [open, onConfirm]);

	return (
		<Modal
			open={open}
			onClose={onCancel}
			title="対戦から退出しますか？"
			actions={
				<>
					<Button variant="secondary" onClick={onCancel}>
						続ける (Esc)
					</Button>
					<Button variant="danger" onClick={onConfirm}>
						退出する (Y)
					</Button>
				</>
			}
		>
			<div className="flex flex-col gap-2">
				<p>退出すると、この試合は放棄した扱いになります。</p>
				<p className="text-caption text-slate-400">
					このポップアップを開いている間も試合は進行しています。自分のキャラクターは
					その場に立ったままになるため、攻撃を受けたり失点したりすることがあります。
				</p>
			</div>
		</Modal>
	);
}
