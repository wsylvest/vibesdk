/**
 * Filesystem-backed state persistence for standalone agent instances.
 * Provides debounced write-through to JSON files so agent state
 * survives process restarts.
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const DEBOUNCE_MS = 2000;

/** Fields that cannot be serialized to JSON (e.g. Promises, functions). */
const NON_SERIALIZABLE_KEYS = new Set(['generationPromise']);

function stripNonSerializable<T>(state: T): Record<string, unknown> {
    const obj = { ...state } as Record<string, unknown>;
    for (const key of NON_SERIALIZABLE_KEYS) {
        delete obj[key];
    }
    return obj;
}

/**
 * Tracks all active persistence instances so we can flush them
 * on process shutdown.
 */
const activePersistors = new Set<AgentStatePersistence<unknown>>();

let shutdownHooked = false;

function ensureShutdownHook(): void {
    if (shutdownHooked) return;
    shutdownHooked = true;

    const flushAll = (): void => {
        for (const p of activePersistors) {
            try {
                p.flushSync();
            } catch (err) {
                console.error('[StatePersistence] shutdown flush error:', err);
            }
        }
    };

    process.on('beforeExit', flushAll);
    process.on('SIGTERM', () => { flushAll(); process.exit(0); });
    process.on('SIGINT', () => { flushAll(); process.exit(0); });
}

export class AgentStatePersistence<T> {
    private dirty = false;
    private pendingState: T | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private readonly stateFile: string;

    constructor(stateDir: string, agentId: string) {
        this.stateFile = join(stateDir, agentId, 'state.json');
        activePersistors.add(this as AgentStatePersistence<unknown>);
        ensureShutdownHook();
    }

    /**
     * Synchronously load persisted state from disk.
     * Returns null if no state file exists or it can't be parsed.
     */
    loadSync(): T | null {
        try {
            if (!existsSync(this.stateFile)) return null;
            const data = readFileSync(this.stateFile, 'utf-8');
            return JSON.parse(data) as T;
        } catch {
            return null;
        }
    }

    /**
     * Mark state as dirty. The actual write is debounced.
     */
    markDirty(state: T): void {
        this.pendingState = state;
        this.dirty = true;

        if (this.timer) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            this.flushSync();
        }, DEBOUNCE_MS);
        if (this.timer.unref) {
            this.timer.unref();
        }
    }

    /**
     * Synchronously write pending state to disk. Called on debounce
     * timeout and on process shutdown.
     */
    flushSync(): void {
        if (!this.dirty || this.pendingState === null) return;
        this.dirty = false;
        const state = this.pendingState;

        try {
            const dir = dirname(this.stateFile);
            if (!existsSync(dir)) {
                mkdirSync(dir, { recursive: true });
            }
            const serializable = stripNonSerializable(state);
            writeFileSync(this.stateFile, JSON.stringify(serializable), 'utf-8');
        } catch (err) {
            console.error('[StatePersistence] write error:', err);
        }
    }

    /**
     * Remove this instance from the active set (e.g. when agent is deleted).
     */
    dispose(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.flushSync();
        activePersistors.delete(this as AgentStatePersistence<unknown>);
    }
}
