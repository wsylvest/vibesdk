/**
 * Filesystem-backed KV store that implements the KVNamespace interface subset
 * used by the application. Replaces Cloudflare KV for standalone mode.
 *
 * Data is persisted to a JSON file via DebouncedFileWriter so that platform
 * configs, user configs, and wrangler configs survive process restarts.
 */

import { DebouncedFileWriter } from './debounced-file-writer';
import type { AppKVStore } from '../types/service-bindings';

interface KVEntry {
    value: string;
    expiration?: number;
}

export class FileBackedKVStore implements AppKVStore {
    private store = new Map<string, KVEntry>();
    private readonly writer: DebouncedFileWriter;

    constructor(filePath: string) {
        this.writer = new DebouncedFileWriter(filePath);
        this.loadFromDisk();
    }

    private loadFromDisk(): void {
        const raw = this.writer.readSync();
        if (!raw) return;
        try {
            const entries = JSON.parse(raw) as Record<string, KVEntry>;
            const now = Date.now() / 1000;
            for (const [key, entry] of Object.entries(entries)) {
                if (entry.expiration && now > entry.expiration) continue;
                this.store.set(key, entry);
            }
        } catch {
            // Corrupt file — start fresh
        }
    }

    private scheduleSave(): void {
        const obj: Record<string, KVEntry> = {};
        const now = Date.now() / 1000;
        for (const [key, entry] of this.store) {
            if (entry.expiration && now > entry.expiration) continue;
            obj[key] = entry;
        }
        this.writer.write(JSON.stringify(obj));
    }

    async get(key: string, type?: string): Promise<string | Record<string, unknown> | null> {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (entry.expiration && Date.now() / 1000 > entry.expiration) {
            this.store.delete(key);
            this.scheduleSave();
            return null;
        }
        if (type === 'json') {
            try {
                return JSON.parse(entry.value) as Record<string, unknown>;
            } catch {
                return null;
            }
        }
        return entry.value;
    }

    async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
        const entry: KVEntry = { value };
        if (options?.expirationTtl) {
            entry.expiration = Math.floor(Date.now() / 1000) + options.expirationTtl;
        }
        this.store.set(key, entry);
        this.scheduleSave();
    }

    async delete(key: string): Promise<void> {
        this.store.delete(key);
        this.scheduleSave();
    }

    async list(options?: { prefix?: string; cursor?: string }): Promise<{
        keys: Array<{ name: string }>;
        list_complete: boolean;
        cursor?: string;
    }> {
        const prefix = options?.prefix || '';
        const now = Date.now() / 1000;
        const keys: Array<{ name: string }> = [];
        for (const [key, entry] of this.store) {
            if (entry.expiration && now > entry.expiration) continue;
            if (key.startsWith(prefix)) {
                keys.push({ name: key });
            }
        }
        return { keys, list_complete: true };
    }
}
