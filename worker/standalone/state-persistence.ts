/**
 * Filesystem-backed state persistence for standalone agent instances.
 * Uses DebouncedFileWriter for async I/O with sync fallback on shutdown.
 */

import { join } from 'node:path';
import { DebouncedFileWriter } from './debounced-file-writer';

/** Fields that cannot be serialized to JSON (e.g. Promises, functions). */
const NON_SERIALIZABLE_KEYS = new Set(['generationPromise']);

function stripNonSerializable<T>(state: T): Record<string, unknown> {
    const obj = { ...state } as Record<string, unknown>;
    for (const key of NON_SERIALIZABLE_KEYS) {
        delete obj[key];
    }
    return obj;
}

export class AgentStatePersistence<T> {
    private readonly writer: DebouncedFileWriter;

    constructor(stateDir: string, agentId: string) {
        this.writer = new DebouncedFileWriter(join(stateDir, agentId, 'state.json'));
    }

    /**
     * Synchronously load persisted state from disk.
     * Returns null if no state file exists or it can't be parsed.
     */
    loadSync(): T | null {
        const raw = this.writer.readSync();
        if (!raw) return null;
        try {
            return JSON.parse(raw) as T;
        } catch {
            return null;
        }
    }

    /**
     * Mark state as dirty. The write is debounced and executed asynchronously.
     */
    markDirty(state: T): void {
        const serializable = stripNonSerializable(state);
        this.writer.write(JSON.stringify(serializable));
    }

    /**
     * Flush pending data and deregister from shutdown hooks.
     */
    dispose(): void {
        this.writer.dispose();
    }
}
