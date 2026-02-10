/**
 * Global environment accessor for standalone mode.
 * Replaces `import { env } from 'cloudflare:workers'` with a Proxy-based
 * accessor that provides the same API after initialization.
 */

let _env: Env | null = null;

export function setGlobalEnv(e: Env): void {
    _env = e;
}

/**
 * Proxy-based env accessor that mirrors the `cloudflare:workers` env export.
 * Must call setGlobalEnv() before any env property access.
 */
export const env: Env = new Proxy({} as Env, {
    get(_target, prop: string | symbol) {
        if (!_env) {
            throw new Error(
                `Global env not initialized. Call setGlobalEnv() before accessing env.${String(prop)}`
            );
        }
        return (_env as unknown as Record<string | symbol, unknown>)[prop];
    },
    set(_target, prop: string | symbol, value: unknown) {
        if (!_env) {
            throw new Error('Global env not initialized. Call setGlobalEnv() first.');
        }
        (_env as unknown as Record<string | symbol, unknown>)[prop] = value;
        return true;
    },
});
