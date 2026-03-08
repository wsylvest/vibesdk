/**
 * Compatibility layer replacing the 'agents' package for standalone mode.
 * Provides Agent base class, Connection type, and getAgentByName functionality.
 *
 * Key differences from Cloudflare Durable Objects:
 *  - State persisted to filesystem via AgentStatePersistence (debounced writes)
 *  - WebSocket upgrade uses Node.js `ws` library (no WebSocketPair)
 *  - Agent instances are managed by AgentNamespace registries
 */

import { WebSocketServer, WebSocket as WsWebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import { AgentStatePersistence } from './state-persistence';

/**
 * Connection type matching the 'agents' package Connection interface.
 */
export type Connection = WebSocket & { id: string };

/**
 * Stub context mimicking DurableObjectState for WebSocket tracking.
 */
class AgentContext {
    private websockets: WebSocket[] = [];

    getWebSockets(): WebSocket[] {
        return [...this.websockets];
    }

    acceptWebSocket(ws: WebSocket): void {
        this.websockets.push(ws);
    }

    removeWebSocket(ws: WebSocket): void {
        this.websockets = this.websockets.filter(w => w !== ws);
    }
}

/**
 * Agent base class replacing the 'agents' package Agent<Env, State>.
 * Provides state management and WebSocket connection tracking.
 */
export class Agent<TEnv, TState> {
    env: TEnv;
    state: TState;
    ctx: AgentContext;
    private _persistence: AgentStatePersistence<TState> | null = null;
    private _hasPersistedState = false;

    /** Timestamp of the last message or state change on this agent. */
    lastActivityMs: number = Date.now();

    constructor(env: TEnv, initialState: TState) {
        this.env = env;
        this.state = { ...initialState };
        this.ctx = new AgentContext();
    }

    /**
     * Wire up filesystem-backed state persistence. Called by AgentNamespace
     * after construction. If persisted state exists on disk it is merged
     * into the current state.
     */
    attachPersistence(persistence: AgentStatePersistence<TState>): void {
        this._persistence = persistence;
        const saved = persistence.loadSync();
        if (saved) {
            this.state = { ...this.state, ...saved };
            this._hasPersistedState = true;
        }
    }

    setEnv(env: TEnv): void {
        this.env = env;
    }

    getWebSockets(): WebSocket[] {
        return this.ctx.getWebSockets();
    }

    setState(newState: TState): void {
        this.state = { ...newState };
        this._hasPersistedState = true;
        this.lastActivityMs = Date.now();
        this._persistence?.markDirty(this.state);
    }

    getState(): TState {
        return this.state;
    }

    async getFullState(): Promise<TState> {
        return this.state;
    }

    isInitialized(): boolean | Promise<boolean> {
        return this._hasPersistedState;
    }

    /**
     * Handle an HTTP request. For non-upgrade requests subclasses can override.
     * WebSocket upgrades are handled externally via handleUpgrade() + attachWebSocket().
     */
    async fetch(_request: Request): Promise<Response> {
        return new Response('Not found', { status: 404 });
    }

    // --- WebSocket lifecycle hooks (override in subclass) ---

    onConnect(_connection: Connection, _ctx: unknown): void {
        // Override in subclass
    }

    onMessage(_connection: Connection, _message: string): void {
        // Override in subclass
    }

    onClose(_connection: Connection, _code?: number, _reason?: string): void {
        // Override in subclass
    }

    /**
     * Attach a raw `ws` WebSocket to this agent. Called after the HTTP→WS
     * upgrade completes. Wraps the `ws` socket as a Connection and hooks
     * up the lifecycle events.
     */
    attachWebSocket(rawWs: WsWebSocket): Connection {
        const id = crypto.randomUUID();
        const conn = rawWs as unknown as Connection;

        Object.defineProperty(conn, 'id', { value: id, writable: false, enumerable: true });

        this.ctx.acceptWebSocket(conn as unknown as WebSocket);
        this.lastActivityMs = Date.now();

        try { this.onConnect(conn, {}); } catch (e) { console.error('[Agent] onConnect error:', e); }

        rawWs.on('message', (data: Buffer | string) => {
            this.lastActivityMs = Date.now();
            const message = typeof data === 'string' ? data : data.toString('utf-8');
            try { this.onMessage(conn, message); } catch (e) { console.error('[Agent] onMessage error:', e); }
        });

        rawWs.on('close', (code: number, reason: Buffer) => {
            this.ctx.removeWebSocket(conn as unknown as WebSocket);
            try { this.onClose(conn, code, reason.toString('utf-8')); } catch (e) { console.error('[Agent] onClose error:', e); }
        });

        return conn;
    }

    /**
     * Flush pending state and release persistence resources.
     * Called by AgentNamespace when evicting or deleting an agent.
     */
    dispose(): void {
        this._persistence?.dispose();
        this._persistence = null;
    }
}

// ---------------------------------------------------------------------------
// Agent Namespace — replaces DurableObjectNamespace for standalone mode
// ---------------------------------------------------------------------------

type AgentFactory<T> = (name: string) => T;

/** Default: evict idle agents after 30 minutes with no activity. */
const DEFAULT_EVICTION_TTL_MS = 30 * 60 * 1000;
const EVICTION_CHECK_INTERVAL_MS = 60 * 1000;

/**
 * In-memory namespace that lazily creates agent instances on getByName().
 * Implements the DurableObjectNamespace shape so it can be placed directly
 * on env.CodeGenObject / env.DORateLimitStore and called identically.
 *
 * When stateDir is provided, agent state is persisted to disk and restored
 * on creation so that state survives process restarts.
 *
 * Agents with no active WebSocket connections and no activity for longer
 * than `evictionTtlMs` are automatically evicted (state is flushed first).
 */
export class AgentNamespace<T extends Agent<unknown, unknown>> {
    private instances = new Map<string, T>();
    private factory: AgentFactory<T>;
    private stateDir: string | null;
    private evictionTtlMs: number;
    private evictionTimer: ReturnType<typeof setInterval> | null = null;

    constructor(factory: AgentFactory<T>, stateDir?: string, evictionTtlMs = DEFAULT_EVICTION_TTL_MS) {
        this.factory = factory;
        this.stateDir = stateDir ?? null;
        this.evictionTtlMs = evictionTtlMs;

        if (this.evictionTtlMs > 0) {
            this.evictionTimer = setInterval(() => this.evictIdle(), EVICTION_CHECK_INTERVAL_MS);
            if (this.evictionTimer.unref) this.evictionTimer.unref();
        }
    }

    getByName(name: string): T {
        let instance = this.instances.get(name);
        if (!instance) {
            instance = this.factory(name);
            if (this.stateDir) {
                const persistence = new AgentStatePersistence<unknown>(this.stateDir, name);
                instance.attachPersistence(persistence as AgentStatePersistence<never>);
            }
            this.instances.set(name, instance);
        }
        return instance;
    }

    get(id: string): T {
        return this.getByName(id);
    }

    idFromName(name: string): { toString(): string } {
        return { toString: () => name };
    }

    has(name: string): boolean {
        return this.instances.has(name);
    }

    delete(name: string): boolean {
        const instance = this.instances.get(name);
        if (instance) {
            instance.dispose();
        }
        return this.instances.delete(name);
    }

    /** Number of currently loaded agent instances. */
    get size(): number {
        return this.instances.size;
    }

    /**
     * Evict agents that have no active WebSocket connections and
     * have been idle longer than the configured TTL.
     */
    private evictIdle(): void {
        const now = Date.now();
        for (const [name, instance] of this.instances) {
            const idle = now - instance.lastActivityMs;
            const hasConnections = instance.getWebSockets().length > 0;
            if (!hasConnections && idle > this.evictionTtlMs) {
                instance.dispose();
                this.instances.delete(name);
            }
        }
    }
}

// ---------------------------------------------------------------------------
// getAgentByName — drop-in replacement for the 'agents' package export
// ---------------------------------------------------------------------------

interface GetAgentOptions {
    locationHint?: string;
    jurisdiction?: string;
}

/**
 * Replacement for getAgentByName from the 'agents' package.
 * Delegates to AgentNamespace.getByName() which lazily creates agents
 * (matching the Durable Object auto-instantiation pattern).
 */
export function getAgentByName<TEnv, TAgent extends Agent<TEnv, unknown>>(
    namespace: unknown,
    name: string,
    _options?: GetAgentOptions,
): TAgent {
    const ns = namespace as AgentNamespace<Agent<unknown, unknown>>;
    return ns.getByName(name) as TAgent;
}

// ---------------------------------------------------------------------------
// Shared WebSocketServer for all agent upgrades
// ---------------------------------------------------------------------------

let _wss: WebSocketServer | null = null;

function getOrCreateWss(): WebSocketServer {
    if (!_wss) {
        _wss = new WebSocketServer({ noServer: true });
    }
    return _wss;
}

/**
 * Perform an HTTP→WebSocket upgrade and attach the resulting socket to the
 * given agent. Call this from the HTTP server's 'upgrade' event handler.
 */
export function handleUpgrade(
    agent: Agent<unknown, unknown>,
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
): void {
    const wss = getOrCreateWss();
    wss.handleUpgrade(request, socket, head, (ws) => {
        agent.attachWebSocket(ws);
    });
}
