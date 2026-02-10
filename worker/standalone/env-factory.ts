/**
 * Environment factory for standalone mode.
 * Creates an Env object from process.env and standalone service implementations.
 */

import { join } from 'node:path';
import { FileBackedKVStore } from './kv-store';
import { InMemoryRateLimiter } from './rate-limiter';
import { FileSystemStorage } from './storage';
import { StaticFileServer } from './static-server';
import { AgentNamespace } from './agents-compat';
import { SmartCodeGeneratorAgent } from '../agents/core/smartGeneratorAgent';
import { DORateLimitStore } from '../services/rate-limit/DORateLimitStore';
import type { Agent } from './agents-compat';

function requireEnv(key: string): string {
    const value = process.env[key];
    if (!value) {
        throw new Error(`Required environment variable ${key} is not set`);
    }
    return value;
}

function optionalEnv(key: string, defaultValue = ''): string {
    return process.env[key] || defaultValue;
}

export function createStandaloneEnv(): Env {
    const dataDir = optionalEnv('DATA_DIR', join(process.cwd(), '.data'));
    const distDir = optionalEnv('DIST_DIR', join(process.cwd(), 'dist'));

    // Create a temporary env reference so the AgentNamespace factories can
    // capture it via closure. We mutate `env` after construction so the
    // factories always see the fully-built object.
    let env: Env;

    const agentStateDir = join(dataDir, 'agents');

    const codeGenNamespace = new AgentNamespace<SmartCodeGeneratorAgent>((_name) => {
        return new SmartCodeGeneratorAgent(env, {} as SmartCodeGeneratorAgent['state']);
    }, agentStateDir) as unknown as DurableObjectNamespace;

    const rateLimitNamespace = new AgentNamespace<DORateLimitStore & Agent<unknown, unknown>>((_name) => {
        return new DORateLimitStore() as DORateLimitStore & Agent<unknown, unknown>;
    }) as unknown as DurableObjectNamespace;

    env = {
        // KV Store (filesystem-backed)
        VibecoderStore: new FileBackedKVStore(join(dataDir, 'kv-store.json')) as unknown as KVNamespace,

        // String configuration variables
        TEMPLATES_REPOSITORY: optionalEnv('TEMPLATES_REPOSITORY', 'https://github.com/cloudflare/vibesdk-templates'),
        ALLOWED_EMAIL: optionalEnv('ALLOWED_EMAIL', ''),
        DISPATCH_NAMESPACE: optionalEnv('DISPATCH_NAMESPACE', ''),
        CLOUDFLARE_AI_GATEWAY: optionalEnv('CLOUDFLARE_AI_GATEWAY', ''),
        ENABLE_READ_REPLICAS: optionalEnv('ENABLE_READ_REPLICAS', 'false'),

        // API Keys
        ANTHROPIC_API_KEY: requireEnv('ANTHROPIC_API_KEY'),
        OPENAI_API_KEY: requireEnv('OPENAI_API_KEY'),
        GOOGLE_AI_STUDIO_API_KEY: optionalEnv('GOOGLE_AI_STUDIO_API_KEY'),
        OPENROUTER_API_KEY: optionalEnv('OPENROUTER_API_KEY'),
        CEREBRAS_API_KEY: optionalEnv('CEREBRAS_API_KEY'),
        GROQ_API_KEY: optionalEnv('GROQ_API_KEY'),

        // Sandbox service
        SANDBOX_SERVICE_API_KEY: requireEnv('SANDBOX_SERVICE_API_KEY'),
        SANDBOX_SERVICE_TYPE: optionalEnv('SANDBOX_SERVICE_TYPE', 'runner'),
        SANDBOX_SERVICE_URL: requireEnv('SANDBOX_SERVICE_URL'),

        // Cloudflare API (still needed for deployer service)
        CLOUDFLARE_API_TOKEN: optionalEnv('CLOUDFLARE_API_TOKEN'),
        CLOUDFLARE_ACCOUNT_ID: optionalEnv('CLOUDFLARE_ACCOUNT_ID'),
        CLOUDFLARE_AI_GATEWAY_URL: optionalEnv('CLOUDFLARE_AI_GATEWAY_URL'),
        CLOUDFLARE_AI_GATEWAY_TOKEN: optionalEnv('CLOUDFLARE_AI_GATEWAY_TOKEN'),

        // Search
        SERPAPI_KEY: optionalEnv('SERPAPI_KEY'),

        // OAuth
        GOOGLE_CLIENT_SECRET: optionalEnv('GOOGLE_CLIENT_SECRET'),
        GOOGLE_CLIENT_ID: optionalEnv('GOOGLE_CLIENT_ID'),
        GITHUB_CLIENT_ID: optionalEnv('GITHUB_CLIENT_ID'),
        GITHUB_CLIENT_SECRET: optionalEnv('GITHUB_CLIENT_SECRET'),

        // Security
        JWT_SECRET: requireEnv('JWT_SECRET'),
        ENTROPY_KEY: requireEnv('ENTROPY_KEY'),
        SECRETS_ENCRYPTION_KEY: requireEnv('SECRETS_ENCRYPTION_KEY'),
        ENVIRONMENT: optionalEnv('ENVIRONMENT', 'development'),
        USE_TUNNEL_FOR_PREVIEW: false,

        // Domain
        CUSTOM_DOMAIN: optionalEnv('CUSTOM_DOMAIN', 'localhost'),
        CUSTOM_PREVIEW_DOMAIN: optionalEnv('CUSTOM_PREVIEW_DOMAIN', 'localhost'),

        // Sandbox scaling
        MAX_SANDBOX_INSTANCES: optionalEnv('MAX_SANDBOX_INSTANCES', '10'),
        SANDBOX_INSTANCE_TYPE: optionalEnv('SANDBOX_INSTANCE_TYPE', 'default'),
        ALLOCATION_STRATEGY: optionalEnv('ALLOCATION_STRATEGY', 'round-robin'),

        // GitHub exporter
        GITHUB_EXPORTER_CLIENT_ID: optionalEnv('GITHUB_EXPORTER_CLIENT_ID'),
        GITHUB_EXPORTER_CLIENT_SECRET: optionalEnv('GITHUB_EXPORTER_CLIENT_SECRET'),

        // Observability
        CF_ACCESS_ID: optionalEnv('CF_ACCESS_ID'),
        CF_ACCESS_SECRET: optionalEnv('CF_ACCESS_SECRET'),
        SENTRY_DSN: optionalEnv('SENTRY_DSN'),

        // Standalone service implementations
        TEMPLATES_BUCKET: new FileSystemStorage(join(dataDir, 'templates')) as unknown as R2Bucket,
        API_RATE_LIMITER: new InMemoryRateLimiter(200, 60) as unknown as RateLimit,
        AUTH_RATE_LIMITER: new InMemoryRateLimiter(20, 60) as unknown as RateLimit,
        CF_VERSION_METADATA: { id: optionalEnv('APP_VERSION', 'standalone-dev') } as unknown as WorkerVersionMetadata,
        ASSETS: new StaticFileServer(distDir) as unknown as Fetcher,

        // Null stubs — these CF-only bindings are never accessed at runtime:
        //  DB: DatabaseService manages its own connection via @libsql/client
        //  AI/IMAGES: unused in codebase
        //  DISPATCHER: guarded by isDispatcherAvailable() null check
        //  Sandbox: guarded by SANDBOX_SERVICE_TYPE defaulting to 'runner'
        DB: null as unknown as D1Database,
        AI: null as unknown as Ai,
        IMAGES: null as unknown as ImagesBinding,
        DISPATCHER: null as unknown as DispatchNamespace,
        Sandbox: null as unknown as DurableObjectNamespace,

        // Agent namespace registries (lazy-create agents on getByName)
        CodeGenObject: codeGenNamespace,
        DORateLimitStore: rateLimitNamespace,
    };

    return env;
}
