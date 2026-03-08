/**
 * Application-level service binding interfaces.
 *
 * These define the exact subset of methods the application actually calls on
 * each Env binding. Both Cloudflare runtime types and standalone implementations
 * satisfy these interfaces, eliminating the need for `as unknown as` casts.
 */

// ---------------------------------------------------------------------------
// KV Store
// ---------------------------------------------------------------------------

export interface AppKVStore {
    get(key: string, type?: string): Promise<string | Record<string, unknown> | null>;
    put(key: string, value: string, options?: AppKVPutOptions): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string; cursor?: string }): Promise<AppKVListResult>;
}

export interface AppKVPutOptions {
    expirationTtl?: number;
    expiration?: number;
    metadata?: unknown;
}

export interface AppKVListResult {
    keys: AppKVListKey[];
    list_complete: boolean;
    cursor?: string;
}

export interface AppKVListKey {
    name: string;
    expiration?: number;
    metadata?: unknown;
}

// ---------------------------------------------------------------------------
// Object Storage (replaces R2Bucket)
// ---------------------------------------------------------------------------

export interface AppObjectStorageItem {
    text(): Promise<string>;
    json(): Promise<unknown>;
    arrayBuffer(): Promise<ArrayBuffer>;
    body: ReadableStream;
}

export interface AppObjectStorage {
    get(key: string): Promise<AppObjectStorageItem | null>;
    put(
        key: string,
        value: string | ArrayBuffer | ReadableStream | Uint8Array,
        options?: { httpMetadata?: { contentType?: string } },
    ): Promise<unknown>;
    delete(key: string): Promise<void>;
    list(options?: { prefix?: string }): Promise<{
        objects: Array<{ key: string; size: number }>;
    }>;
}

// ---------------------------------------------------------------------------
// Agent Namespace (replaces DurableObjectNamespace)
// ---------------------------------------------------------------------------

export interface AgentNamespaceBinding<T = unknown> {
    get(id: string): T;
    getByName(name: string): T;
    idFromName(name: string): { toString(): string };
}

// ---------------------------------------------------------------------------
// Rate Limiting
// ---------------------------------------------------------------------------

export interface RateLimitBinding {
    limit(options: { key: string }): Promise<{ success: boolean }>;
}

// ---------------------------------------------------------------------------
// Static Assets
// ---------------------------------------------------------------------------

export interface StaticAssetServer {
    fetch(request: Request): Promise<Response>;
}

// ---------------------------------------------------------------------------
// Version Metadata
// ---------------------------------------------------------------------------

export interface VersionMetadata {
    id: string;
}

// ---------------------------------------------------------------------------
// Null-stub bindings (CF-only, never accessed or null-guarded at runtime)
// ---------------------------------------------------------------------------

export interface DispatchNamespaceBinding {
    get(name: string): { fetch(request: Request): Promise<Response> };
}

export interface D1DatabaseBinding {
    prepare(query: string): unknown;
    exec(query: string): Promise<unknown>;
    batch(statements: unknown[]): Promise<unknown[]>;
}

export interface AiBinding {
    gateway(name: string): { getUrl(provider?: string): Promise<string> };
}

export interface ImagesBindingType {
    input(image: ArrayBuffer): {
        transform(options: unknown): {
            output(options: unknown): Promise<ArrayBuffer>;
        };
    };
}
