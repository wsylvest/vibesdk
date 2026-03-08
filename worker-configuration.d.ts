/* eslint-disable */
/**
 * Standalone environment type definitions.
 * Service binding types are defined in worker/types/service-bindings.ts.
 * This file provides the Env interface and runtime type stubs.
 */

import type {
	AppKVStore,
	AppKVPutOptions,
	AppKVListResult,
	AppKVListKey,
	AppObjectStorage,
	AgentNamespaceBinding,
	RateLimitBinding,
	StaticAssetServer,
	VersionMetadata,
	D1DatabaseBinding,
	DispatchNamespaceBinding,
	AiBinding,
	ImagesBindingType,
} from './worker/types/service-bindings';

// Re-export KV types under their original names for downstream compatibility
// (used in KVCache.ts)
type KVNamespacePutOptions = AppKVPutOptions;
type KVNamespaceListResult<T> = AppKVListResult & { keys: Array<AppKVListKey & { metadata?: T }> };
type KVNamespaceListKey<T> = AppKVListKey & { metadata?: T };

type HeadersInit = Record<string, string> | [string, string][] | Headers;

interface ExecutionContext {
	waitUntil(promise: Promise<unknown>): void;
	passThroughOnException(): void;
}

interface ExportedHandler<E = unknown> {
	fetch?(request: Request, env: E, ctx: ExecutionContext): Promise<Response>;
}

// Standalone stubs for Cloudflare Workers globals
declare const caches: {
	default: {
		match(request: string | Request): Promise<Response | undefined>;
		put(request: string | Request, response: Response): Promise<void>;
		delete(request: string | Request): Promise<boolean>;
	};
	open(cacheName: string): Promise<{
		match(request: string | Request): Promise<Response | undefined>;
		put(request: string | Request, response: Response): Promise<void>;
		delete(request: string | Request): Promise<boolean>;
	}>;
};

// AI Gateway provider type (originally from Cloudflare runtime types)
type AIGatewayProviders = 'openai' | 'anthropic' | 'google' | 'azure-openai' | 'groq' | 'cerebras' | 'openrouter' | string;

interface Env {
	// KV Store
	VibecoderStore: AppKVStore;

	// String configuration variables
	TEMPLATES_REPOSITORY: string;
	ALLOWED_EMAIL: string;
	DISPATCH_NAMESPACE: string;
	CLOUDFLARE_AI_GATEWAY: string;
	ENABLE_READ_REPLICAS: string;

	// API Keys
	ANTHROPIC_API_KEY: string;
	OPENAI_API_KEY: string;
	GOOGLE_AI_STUDIO_API_KEY: string;
	OPENROUTER_API_KEY: string;
	CEREBRAS_API_KEY: string;
	GROQ_API_KEY: string;

	// Sandbox service
	SANDBOX_SERVICE_API_KEY: string;
	SANDBOX_SERVICE_TYPE: string;
	SANDBOX_SERVICE_URL: string;

	// Cloudflare API (still needed for deployer service)
	CLOUDFLARE_API_TOKEN: string;
	CLOUDFLARE_ACCOUNT_ID: string;
	CLOUDFLARE_AI_GATEWAY_URL: string;
	CLOUDFLARE_AI_GATEWAY_TOKEN: string;

	// Search
	SERPAPI_KEY: string;

	// OAuth
	GOOGLE_CLIENT_SECRET: string;
	GOOGLE_CLIENT_ID: string;
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;

	// Security
	JWT_SECRET: string;
	ENTROPY_KEY: string;
	ENVIRONMENT: string;
	USE_TUNNEL_FOR_PREVIEW: boolean;
	SECRETS_ENCRYPTION_KEY: string;

	// Domain
	CUSTOM_DOMAIN: string;
	CUSTOM_PREVIEW_DOMAIN: string;

	// Sandbox scaling
	MAX_SANDBOX_INSTANCES: string;
	SANDBOX_INSTANCE_TYPE: string;
	ALLOCATION_STRATEGY: string;

	// GitHub exporter
	GITHUB_EXPORTER_CLIENT_ID: string;
	GITHUB_EXPORTER_CLIENT_SECRET: string;

	// Observability
	CF_ACCESS_ID: string;
	CF_ACCESS_SECRET: string;
	SENTRY_DSN: string;

	// Service bindings (application-level interfaces)
	CodeGenObject: AgentNamespaceBinding;
	DORateLimitStore: AgentNamespaceBinding;
	TEMPLATES_BUCKET: AppObjectStorage;
	API_RATE_LIMITER: RateLimitBinding;
	AUTH_RATE_LIMITER: RateLimitBinding;
	ASSETS: StaticAssetServer;
	CF_VERSION_METADATA: VersionMetadata;

	// Null-stub bindings — CF-only, never accessed or null-guarded at runtime
	DB: D1DatabaseBinding | null;
	AI: AiBinding | null;
	IMAGES: ImagesBindingType | null;
	DISPATCHER: DispatchNamespaceBinding | null;
	Sandbox: AgentNamespaceBinding | null;
}

type StringifyValues<EnvType extends Record<string, unknown>> = {
	[Binding in keyof EnvType]: EnvType[Binding] extends string ? EnvType[Binding] : string;
};

declare namespace NodeJS {
	interface ProcessEnv extends StringifyValues<Pick<Env, "TEMPLATES_REPOSITORY" | "ALLOWED_EMAIL" | "DISPATCH_NAMESPACE" | "CLOUDFLARE_AI_GATEWAY" | "ENABLE_READ_REPLICAS" | "ANTHROPIC_API_KEY" | "OPENAI_API_KEY" | "GOOGLE_AI_STUDIO_API_KEY" | "OPENROUTER_API_KEY" | "CEREBRAS_API_KEY" | "GROQ_API_KEY" | "SANDBOX_SERVICE_API_KEY" | "SANDBOX_SERVICE_TYPE" | "SANDBOX_SERVICE_URL" | "CLOUDFLARE_API_TOKEN" | "CLOUDFLARE_ACCOUNT_ID" | "CLOUDFLARE_AI_GATEWAY_URL" | "CLOUDFLARE_AI_GATEWAY_TOKEN" | "SERPAPI_KEY" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_CLIENT_ID" | "GITHUB_CLIENT_ID" | "GITHUB_CLIENT_SECRET" | "JWT_SECRET" | "ENTROPY_KEY" | "ENVIRONMENT" | "SECRETS_ENCRYPTION_KEY" | "MAX_SANDBOX_INSTANCES" | "SANDBOX_INSTANCE_TYPE" | "CUSTOM_DOMAIN" | "CUSTOM_PREVIEW_DOMAIN" | "ALLOCATION_STRATEGY" | "GITHUB_EXPORTER_CLIENT_ID" | "GITHUB_EXPORTER_CLIENT_SECRET" | "CF_ACCESS_ID" | "CF_ACCESS_SECRET" | "SENTRY_DSN">> {}
}
