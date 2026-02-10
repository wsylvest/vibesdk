/**
 * Compatibility layer replacing the 'agents' package for standalone mode.
 * Provides Agent base class, Connection type, and getAgentByName functionality.
 */

/**
 * Connection type matching the 'agents' package Connection interface.
 * Extends WebSocket with an id property for agent tracking.
 */
export type Connection = WebSocket & { id: string };

/**
 * Stub context object mimicking DurableObjectState for WebSocket tracking.
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
 * Provides state management and WebSocket connection tracking without Durable Objects.
 */
export class Agent<TEnv, TState> {
    env: TEnv;
    state: TState;
    ctx: AgentContext;
    private _initialized = false;

    constructor(env: TEnv, initialState: TState) {
        this.env = env;
        this.state = { ...initialState };
        this.ctx = new AgentContext();
    }

    setEnv(env: TEnv): void {
        this.env = env;
    }

    getWebSockets(): WebSocket[] {
        return this.ctx.getWebSockets();
    }

    addConnection(conn: Connection): void {
        this.ctx.acceptWebSocket(conn);
    }

    removeConnection(conn: Connection): void {
        this.ctx.removeWebSocket(conn);
    }

    setState(newState: TState): void {
        this.state = { ...newState };
    }

    getState(): TState {
        return this.state;
    }

    async getFullState(): Promise<TState> {
        return this.state;
    }

    isInitialized(): boolean | Promise<boolean> {
        return this._initialized;
    }

    markInitialized(): void {
        this._initialized = true;
    }

    async fetch(request: Request): Promise<Response> {
        const upgradeHeader = request.headers.get('Upgrade');
        if (upgradeHeader === 'websocket') {
            const { 0: client, 1: server } = new WebSocketPair();
            const id = crypto.randomUUID();
            const conn = Object.assign(server, { id }) as Connection;
            (server as WebSocket & { accept?: () => void }).accept?.();
            this.ctx.acceptWebSocket(server);
            this.onConnect(conn, {});
            server.addEventListener('message', (event) => {
                this.onMessage(conn, typeof event.data === 'string' ? event.data : String(event.data));
            });
            server.addEventListener('close', (event) => {
                this.ctx.removeWebSocket(server);
                this.onClose(conn, event.code, event.reason);
            });
            return new Response(null, { status: 101, webSocket: client } as ResponseInit);
        }
        return new Response('Not found', { status: 404 });
    }

    onConnect(_connection: Connection, _ctx: unknown): void {
        // Override in subclass
    }

    onMessage(_connection: Connection, _message: string): void {
        // Override in subclass
    }

    onClose(_connection: Connection, _code?: number, _reason?: string): void {
        // Override in subclass
    }
}

/**
 * In-memory agent registry replacing DurableObjectNamespace + getAgentByName.
 * Stores agent instances by name (agentId).
 */
const agentInstances = new Map<string, Agent<unknown, unknown>>();

interface GetAgentOptions {
    locationHint?: string;
    jurisdiction?: string;
}

/**
 * Replacement for `getAgentByName` from the 'agents' package.
 * Retrieves or creates an agent instance by name from the in-memory registry.
 */
export function getAgentByName<TEnv, TAgent extends Agent<TEnv, unknown>>(
    _namespace: unknown,
    name: string,
    _options?: GetAgentOptions,
): TAgent {
    const existing = agentInstances.get(name);
    if (existing) {
        return existing as TAgent;
    }
    throw new Error(`Agent '${name}' not found. Create it first via the agent controller.`);
}

/**
 * Register an agent instance in the global registry.
 */
export function registerAgent(name: string, agent: Agent<unknown, unknown>): void {
    agentInstances.set(name, agent);
}

/**
 * Check if an agent exists in the registry.
 */
export function hasAgent(name: string): boolean {
    return agentInstances.has(name);
}

/**
 * Create and register a new agent instance.
 */
export function createAndRegisterAgent<TEnv, TState>(
    name: string,
    env: TEnv,
    initialState: TState,
    AgentClass: new (env: TEnv, initialState: TState) => Agent<TEnv, TState>,
): Agent<TEnv, TState> {
    const agent = new AgentClass(env, initialState);
    agentInstances.set(name, agent as Agent<unknown, unknown>);
    return agent;
}
