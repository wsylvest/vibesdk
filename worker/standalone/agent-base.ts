/**
 * Standalone Agent base class that replaces the Cloudflare `Agent` from the 'agents' package.
 * Provides state management and WebSocket connection tracking without Durable Objects.
 */

export type AgentConnection = WebSocket & { id?: string };

export class StandaloneAgent<TEnv, TState extends Record<string, unknown>> {
    protected env: TEnv;
    protected state: TState;
    private connections = new Set<AgentConnection>();
    private _initialized = false;

    constructor(env: TEnv, initialState: TState) {
        this.env = env;
        this.state = initialState;
    }

    getWebSockets(): WebSocket[] {
        return Array.from(this.connections);
    }

    addConnection(ws: AgentConnection): void {
        this.connections.add(ws);
    }

    removeConnection(ws: AgentConnection): void {
        this.connections.delete(ws);
    }

    async setState(newState: Partial<TState>): Promise<void> {
        this.state = { ...this.state, ...newState };
    }

    getState(): TState {
        return this.state;
    }

    async getFullState(): Promise<TState> {
        return this.state;
    }

    isInitialized(): boolean {
        return this._initialized;
    }

    markInitialized(): void {
        this._initialized = true;
    }

    onConnect(_connection: AgentConnection, _ctx: unknown): void {
        // Override in subclass
    }

    onMessage(_connection: AgentConnection, _message: string): void {
        // Override in subclass
    }

    onClose(_connection: AgentConnection): void {
        // Override in subclass
    }
}
