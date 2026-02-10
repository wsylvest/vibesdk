/* eslint-disable */
/**
 * Standalone environment type definitions.
 * Replaces the Wrangler-generated Cloudflare types with standalone-compatible interfaces.
 */

// Standalone interface stubs for CF binding types used in the codebase

type HeadersInit = Record<string, string> | [string, string][] | Headers;

interface KVNamespace {
	get(key: string, type?: string): Promise<string | null>;
	get(key: string, type: 'json'): Promise<unknown>;
	put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
	delete(key: string): Promise<void>;
	list(options?: { prefix?: string; cursor?: string }): Promise<{
		keys: Array<{ name: string }>;
		list_complete: boolean;
		cursor?: string;
	}>;
}

interface KVNamespacePutOptions {
	expirationTtl?: number;
	expiration?: number;
	metadata?: unknown;
}

interface KVNamespaceListResult<T> {
	keys: KVNamespaceListKey<T>[];
	list_complete: boolean;
	cursor?: string;
}

interface KVNamespaceListKey<T> {
	name: string;
	expiration?: number;
	metadata?: T;
}

interface R2Bucket {
	get(key: string): Promise<{ text(): Promise<string>; json(): Promise<unknown>; arrayBuffer(): Promise<ArrayBuffer>; body: ReadableStream } | null>;
	put(key: string, value: string | ArrayBuffer | ReadableStream | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
	delete(key: string): Promise<void>;
	list(options?: { prefix?: string }): Promise<{ objects: Array<{ key: string; size: number }> }>;
}

interface D1Database {
	prepare(query: string): unknown;
	exec(query: string): Promise<unknown>;
	batch(statements: unknown[]): Promise<unknown[]>;
}

interface DurableObjectNamespace<T = unknown> {
	get(id: string): T;
	getByName(name: string): T;
	idFromName(name: string): { toString(): string };
}

interface DispatchNamespace {
	get(name: string): { fetch(request: Request): Promise<Response> };
}

interface RateLimit {
	limit(options: { key: string }): Promise<{ success: boolean }>;
}

interface Ai {
	gateway(name: string): {
		getUrl(provider?: string): Promise<string>;
	};
}

interface ImagesBinding {
	input(image: ArrayBuffer): { transform(options: unknown): { output(options: unknown): Promise<ArrayBuffer> } };
}

interface WorkerVersionMetadata {
	id: string;
}

interface Fetcher {
	fetch(request: Request): Promise<Response>;
}

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

// WebSocket pair for upgrade responses (Cloudflare Workers pattern)
declare class WebSocketPair {
	0: WebSocket;
	1: WebSocket;
}

// Response extension for WebSocket upgrade (Cloudflare Workers pattern)
interface ResponseInit {
	webSocket?: WebSocket;
}

interface Env {
	// KV Store
	VibecoderStore: KVNamespace;

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

	// Service bindings (standalone implementations)
	CodeGenObject: DurableObjectNamespace;
	Sandbox: DurableObjectNamespace;
	DORateLimitStore: DurableObjectNamespace;
	TEMPLATES_BUCKET: R2Bucket;
	DB: D1Database;
	DISPATCHER: DispatchNamespace;
	API_RATE_LIMITER: RateLimit;
	AUTH_RATE_LIMITER: RateLimit;
	AI: Ai;
	IMAGES: ImagesBinding;
	CF_VERSION_METADATA: WorkerVersionMetadata;
	ASSETS: Fetcher;
}

type StringifyValues<EnvType extends Record<string, unknown>> = {
	[Binding in keyof EnvType]: EnvType[Binding] extends string ? EnvType[Binding] : string;
};

declare namespace NodeJS {
	interface ProcessEnv extends StringifyValues<Pick<Env, "TEMPLATES_REPOSITORY" | "ALLOWED_EMAIL" | "DISPATCH_NAMESPACE" | "CLOUDFLARE_AI_GATEWAY" | "ENABLE_READ_REPLICAS" | "ANTHROPIC_API_KEY" | "OPENAI_API_KEY" | "GOOGLE_AI_STUDIO_API_KEY" | "OPENROUTER_API_KEY" | "CEREBRAS_API_KEY" | "GROQ_API_KEY" | "SANDBOX_SERVICE_API_KEY" | "SANDBOX_SERVICE_TYPE" | "SANDBOX_SERVICE_URL" | "CLOUDFLARE_API_TOKEN" | "CLOUDFLARE_ACCOUNT_ID" | "CLOUDFLARE_AI_GATEWAY_URL" | "CLOUDFLARE_AI_GATEWAY_TOKEN" | "SERPAPI_KEY" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_CLIENT_ID" | "GITHUB_CLIENT_ID" | "GITHUB_CLIENT_SECRET" | "JWT_SECRET" | "ENTROPY_KEY" | "ENVIRONMENT" | "SECRETS_ENCRYPTION_KEY" | "MAX_SANDBOX_INSTANCES" | "SANDBOX_INSTANCE_TYPE" | "CUSTOM_DOMAIN" | "CUSTOM_PREVIEW_DOMAIN" | "ALLOCATION_STRATEGY" | "GITHUB_EXPORTER_CLIENT_ID" | "GITHUB_EXPORTER_CLIENT_SECRET" | "CF_ACCESS_ID" | "CF_ACCESS_SECRET" | "SENTRY_DSN">> {}
}
