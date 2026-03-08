import { useEffect } from 'react';

type ViewMode = 'editor' | 'preview' | 'blueprint' | 'terminal';

interface KeyboardShortcutOptions {
	onViewChange: (view: ViewMode) => void;
	previewAvailable: boolean;
}

export function useKeyboardShortcuts({
	onViewChange,
	previewAvailable,
}: KeyboardShortcutOptions) {
	useEffect(() => {
		function handleKeyDown(e: KeyboardEvent) {
			const mod = e.metaKey || e.ctrlKey;
			if (!mod) return;

			// Cmd/Ctrl+1 = Editor
			if (e.key === '1') {
				e.preventDefault();
				onViewChange('editor');
				return;
			}

			// Cmd/Ctrl+2 = Preview (only if available)
			if (e.key === '2' && previewAvailable) {
				e.preventDefault();
				onViewChange('preview');
				return;
			}

			// Cmd/Ctrl+3 = Blueprint
			if (e.key === '3') {
				e.preventDefault();
				onViewChange('blueprint');
				return;
			}
		}

		window.addEventListener('keydown', handleKeyDown);
		return () => window.removeEventListener('keydown', handleKeyDown);
	}, [onViewChange, previewAvailable]);
}
