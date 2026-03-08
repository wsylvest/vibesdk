/**
 * Shared debounced file writer for standalone persistence layers.
 * Writes are batched and flushed after a configurable delay, with
 * async I/O during normal operation and sync fallback on shutdown.
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';

const DEFAULT_DEBOUNCE_MS = 2000;

const activeWriters = new Set<DebouncedFileWriter>();
let shutdownHooked = false;

function ensureShutdownHook(): void {
    if (shutdownHooked) return;
    shutdownHooked = true;

    const flushAll = (): void => {
        for (const w of activeWriters) {
            try { w.flushSync(); } catch (err) {
                console.error('[DebouncedFileWriter] shutdown flush error:', err);
            }
        }
    };

    process.on('beforeExit', flushAll);
    process.on('SIGTERM', () => { flushAll(); process.exit(0); });
    process.on('SIGINT', () => { flushAll(); process.exit(0); });
}

export class DebouncedFileWriter {
    private dirty = false;
    private pendingData: string | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private writing = false;
    private readonly debounceMs: number;
    readonly filePath: string;

    constructor(filePath: string, debounceMs = DEFAULT_DEBOUNCE_MS) {
        this.filePath = filePath;
        this.debounceMs = debounceMs;
        activeWriters.add(this);
        ensureShutdownHook();
    }

    /**
     * Read file contents synchronously. Returns null if missing or corrupt.
     */
    readSync(): string | null {
        try {
            if (!existsSync(this.filePath)) return null;
            return readFileSync(this.filePath, 'utf-8');
        } catch {
            return null;
        }
    }

    /**
     * Read file contents asynchronously. Returns null if missing or corrupt.
     */
    async read(): Promise<string | null> {
        try {
            if (!existsSync(this.filePath)) return null;
            return await readFile(this.filePath, 'utf-8');
        } catch {
            return null;
        }
    }

    /**
     * Schedule a debounced write. The actual I/O happens asynchronously.
     */
    write(data: string): void {
        this.pendingData = data;
        this.dirty = true;

        if (this.timer) return;
        this.timer = setTimeout(() => {
            this.timer = null;
            this.flushAsync().catch(err => {
                console.error('[DebouncedFileWriter] async flush error:', err);
            });
        }, this.debounceMs);
        if (this.timer.unref) this.timer.unref();
    }

    /**
     * Async flush — used during normal operation (debounce callback).
     */
    async flushAsync(): Promise<void> {
        if (!this.dirty || this.pendingData === null || this.writing) return;
        this.dirty = false;
        this.writing = true;
        const data = this.pendingData;
        try {
            await this.ensureDir();
            await writeFile(this.filePath, data, 'utf-8');
        } catch (err) {
            console.error(`[DebouncedFileWriter] write error (${this.filePath}):`, err);
        } finally {
            this.writing = false;
        }
    }

    /**
     * Sync flush — used only during process shutdown when the event loop
     * is draining and async operations may not complete.
     */
    flushSync(): void {
        if (!this.dirty || this.pendingData === null) return;
        this.dirty = false;
        try {
            const dir = dirname(this.filePath);
            if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
            writeFileSync(this.filePath, this.pendingData, 'utf-8');
        } catch (err) {
            console.error(`[DebouncedFileWriter] sync write error (${this.filePath}):`, err);
        }
    }

    /**
     * Stop the debounce timer, flush pending data, and deregister.
     */
    dispose(): void {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        this.flushSync();
        activeWriters.delete(this);
    }

    private async ensureDir(): Promise<void> {
        const dir = dirname(this.filePath);
        if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
        }
    }
}
