# Plan: Eliminate `as unknown as` Casts via Standalone Env Interface

## Problem

Every standalone service implementation in `env-factory.ts` is double-cast
(`as unknown as CloudflareType`). TypeScript cannot verify that our
implementations satisfy the contracts. Missing methods blow up at runtime
instead of at compile time.

## Root Cause

The `Env` interface in `worker-configuration.d.ts` defines bindings using
Cloudflare-specific types (`KVNamespace`, `R2Bucket`, `DurableObjectNamespace`,
etc.). Our standalone implementations don't extend those interfaces — they just
happen to implement the subset of methods the application uses.

## Approach

Replace the Cloudflare-specific binding types in `Env` with **narrow
application-level interfaces** that describe only the methods actually called.
Both the Cloudflare runtime and the standalone runtime can satisfy these
interfaces without casts.

---

## Phase 1: Define Application-Level Service Interfaces

Create `worker/types/service-bindings.ts` with interfaces derived from actual
usage analysis (every call site was audited — see Usage column below).

```
Interface                 | Methods Required                           | Used By
------------------------- | ------------------------------------------ | ------------------------------------------
AppKVStore                | get(key, type?), put(key, value, opts?),   | config/index.ts, sandboxSdkClient.ts,
                          | delete(key), list(opts?)                   | rateLimits.ts, KVCache.ts
AppObjectStorage          | get(key), put(key, value, opts?),          | BaseSandboxService.ts, sandboxSdkClient.ts,
                          | delete(key), list(opts?)                   | simpleGeneratorAgent.ts, screenshots ctrl
AppObjectStorageItem      | text(), json(), arrayBuffer(), body        | (return type of AppObjectStorage.get)
AgentNamespaceBinding<T>  | get(id), getByName(name),                  | agents/index.ts, rateLimits.ts
                          | idFromName(name)                           |
RateLimitBinding          | limit({ key })                             | rateLimits.ts (via dynamic binding name)
StaticAssetServer         | fetch(request)                             | app.ts
VersionMetadata           | id: string                                 | env-factory.ts (only construction)
```

**Unused bindings (null stubs — keep as `null`):**
- `DB` — only truthy-checked at simpleGeneratorAgent.ts:2481 (`if (!this.env.DB`)
- `AI` — never accessed at runtime
- `IMAGES` — never accessed at runtime
- `DISPATCHER` — only null-checked at dispatcherUtils.ts:12
- `Sandbox` — only used when `SANDBOX_SERVICE_TYPE !== 'runner'` (defaults to `'runner'`)

For the null stubs, the Env interface should type them as `T | null` so no cast
is needed.

### Concrete Interface Definitions

```typescript
// worker/types/service-bindings.ts

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

export interface AppKVStore {
    get(key: string, type?: string): Promise<string | Record<string, unknown> | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: {
        prefix?: string;
        cursor?: string;
    }): Promise<{
        keys: Array<{ name: string }>;
        list_complete: boolean;
        cursor?: string;
    }>;
}

export interface AgentNamespaceBinding<T = unknown> {
    get(id: string): T;
    getByName(name: string): T;
    idFromName(name: string): { toString(): string };
}

export interface RateLimitBinding {
    limit(options: { key: string }): Promise<{ success: boolean }>;
}

export interface StaticAssetServer {
    fetch(request: Request): Promise<Response>;
}

export interface VersionMetadata {
    id: string;
}

// Null-stub types (never accessed at runtime, or guarded by null checks)
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
```

---

## Phase 2: Rewrite `Env` Interface

Replace `worker-configuration.d.ts` `Env` to use the new interfaces:

```typescript
interface Env {
    // KV Store
    VibecoderStore: AppKVStore;

    // ... string config vars unchanged ...

    // Service bindings (standalone-compatible interfaces)
    CodeGenObject: AgentNamespaceBinding<SmartCodeGeneratorAgent>;
    DORateLimitStore: AgentNamespaceBinding<DORateLimitStore>;
    TEMPLATES_BUCKET: AppObjectStorage;
    API_RATE_LIMITER: RateLimitBinding;
    AUTH_RATE_LIMITER: RateLimitBinding;
    ASSETS: StaticAssetServer;
    CF_VERSION_METADATA: VersionMetadata;

    // Null stubs — CF-only, never accessed at runtime or guarded by null checks
    DB: D1DatabaseBinding | null;
    AI: AiBinding | null;
    IMAGES: ImagesBindingType | null;
    DISPATCHER: DispatchNamespaceBinding | null;
    Sandbox: AgentNamespaceBinding | null;
}
```

---

## Phase 3: Make Standalone Implementations `implements` the Interfaces

```typescript
// kv-store.ts
export class FileBackedKVStore implements AppKVStore { ... }

// storage.ts
export class FileSystemStorage implements AppObjectStorage { ... }

// agents-compat.ts
export class AgentNamespace<T> implements AgentNamespaceBinding<T> { ... }

// rate-limiter.ts
export class InMemoryRateLimiter implements RateLimitBinding { ... }

// static-server.ts
export class StaticFileServer implements StaticAssetServer { ... }
```

---

## Phase 4: Remove All Casts from `env-factory.ts`

Before:
```typescript
VibecoderStore: new FileBackedKVStore(...) as unknown as KVNamespace,
TEMPLATES_BUCKET: new FileSystemStorage(...) as unknown as R2Bucket,
DB: null as unknown as D1Database,
```

After:
```typescript
VibecoderStore: new FileBackedKVStore(...),
TEMPLATES_BUCKET: new FileSystemStorage(...),
DB: null,
```

Every line that currently has `as unknown as` becomes a direct assignment. If
the implementation doesn't satisfy the interface, TypeScript catches it at
compile time.

---

## Phase 5: Fix Downstream Type Narrowing

Changing `DB`, `AI`, `IMAGES`, `DISPATCHER`, `Sandbox` from concrete types to
`T | null` will surface every access site that doesn't null-check. Expected
changes:

| File | Current Code | Fix |
|------|-------------|-----|
| `simpleGeneratorAgent.ts:2481` | `if (!this.env.DB \|\| ...)` | Already guarded — no change needed |
| `dispatcherUtils.ts:12` | `env.DISPATCHER != null` | Already guarded — no change needed |
| `sandboxSdkClient.ts:150` | `env.Sandbox` | Already guarded by `SANDBOX_SERVICE_TYPE` check |

If any new sites surface, they indicate code that would crash at runtime
today — the type change exposes real bugs.

---

## Phase 6: Delete Dead Type Stubs

Remove from `worker-configuration.d.ts`:
- `KVNamespace`, `KVNamespacePutOptions`, `KVNamespaceListResult`, `KVNamespaceListKey`
- `R2Bucket`
- `D1Database`
- `DurableObjectNamespace`
- `DispatchNamespace`
- `RateLimit`
- `Ai`
- `ImagesBinding`
- `WorkerVersionMetadata`
- `Fetcher`

These are replaced by the application-level interfaces in
`worker/types/service-bindings.ts`. Keep `ExecutionContext`, `ExportedHandler`,
`caches` declaration, `HeadersInit`, and `AIGatewayProviders` as they may still
be referenced.

---

## Execution Order

1. Create `worker/types/service-bindings.ts` (new file)
2. Update `worker-configuration.d.ts` `Env` to use new interfaces
3. Add `implements` clauses to standalone classes
4. Remove all `as unknown as` casts from `env-factory.ts`
5. Build — fix any type errors (these are real bugs surfaced by precise types)
6. Delete dead Cloudflare type stubs from `worker-configuration.d.ts`
7. Build again — verify clean

---

## Risk Assessment

| Risk | Mitigation |
|------|-----------|
| Cloudflare types used in 3rd-party imports | Audited: no 3rd-party code references our stubs |
| `rateLimits.ts` dynamic binding access `env[bindingName]` | Change to union type or type assertion at that single call site |
| `DORateLimitStore.getByName()` returns typed agent | Generic `AgentNamespaceBinding<T>` handles this |
| `null` binding types break downstream | All sites already null-guard — compiler confirms |

## Estimated Scope

- 3 new files, ~150 lines
- 6 modified files
- ~40 lines of casts removed
- ~20 lines of dead type stubs removed
- Zero runtime behavior changes
