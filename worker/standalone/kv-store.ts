/**
 * In-memory KV store that implements the KVNamespace interface subset
 * used by the application. Replaces Cloudflare KV for standalone mode.
 */

interface KVEntry {
    value: string;
    expiration?: number;
}

export class MemoryKVStore {
    private store = new Map<string, KVEntry>();

    async get(key: string, type?: string): Promise<string | Record<string, unknown> | null> {
        const entry = this.store.get(key);
        if (!entry) return null;
        if (entry.expiration && Date.now() / 1000 > entry.expiration) {
            this.store.delete(key);
            return null;
        }
        if (type === 'json') {
            return JSON.parse(entry.value) as Record<string, unknown>;
        }
        return entry.value;
    }

    async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
        const entry: KVEntry = { value };
        if (options?.expirationTtl) {
            entry.expiration = Math.floor(Date.now() / 1000) + options.expirationTtl;
        }
        this.store.set(key, entry);
    }

    async delete(key: string): Promise<void> {
        this.store.delete(key);
    }

    async list(options?: { prefix?: string; cursor?: string }): Promise<{
        keys: Array<{ name: string }>;
        list_complete: boolean;
        cursor?: string;
    }> {
        const prefix = options?.prefix || '';
        const keys = Array.from(this.store.keys())
            .filter(k => k.startsWith(prefix))
            .map(name => ({ name }));
        return { keys, list_complete: true };
    }
}
