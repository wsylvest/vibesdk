import clsx from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { Eye, Code } from 'lucide-react';

export function ViewModeSwitch({
	view,
	onChange,
	previewAvailable = false,
	showTooltip = false,
	previewHasUpdate = false,
}: {
	view: 'preview' | 'editor' | 'blueprint'
	onChange: (mode: 'preview' | 'editor' | 'blueprint') => void;
	previewAvailable: boolean;
	showTooltip: boolean;
	previewHasUpdate?: boolean;
}) {
	if (!previewAvailable) {
		return null;
	}

	return (
		<div className="flex items-center gap-1 bg-bg-1 rounded-md p-0.5 relative">
			<AnimatePresence>
				{showTooltip && (
					<motion.div
						initial={{ opacity: 0, scale: 0.4 }}
						animate={{ opacity: 1, scale: 1 }}
						exit={{ opacity: 0, scale: 0 }}
						className="absolute z-50 top-10 left-0 bg-bg-2 text-text-primary text-xs px-2 py-1 rounded whitespace-nowrap animate-fade-in"
					>
						You can view code anytime from here
					</motion.div>
				)}
			</AnimatePresence>

			<button
				onClick={() => onChange('preview')}
				className={clsx(
					'relative p-1 flex items-center justify-between h-full rounded-md transition-colors',
					view === 'preview'
						? 'bg-bg-4 text-text-primary'
						: 'text-text-50/70 hover:text-text-primary hover:bg-accent',
				)}
			>
				<Eye className="size-4" />
				{previewHasUpdate && view !== 'preview' && (
					<span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-accent animate-pulse" />
				)}
			</button>
			<button
				onClick={() => onChange('editor')}
				className={clsx(
					'p-1 flex items-center justify-between h-full rounded-md transition-colors',
					view === 'editor'
						? 'bg-bg-4 text-text-primary'
						: 'text-text-50/70 hover:text-text-primary hover:bg-accent',
				)}
			>
				<Code className="size-4" />
			</button>
		</div>
	);
}
