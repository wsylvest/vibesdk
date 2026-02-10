/**
 * Agent Registry replaces DurableObjectNamespace for standalone mode.
 * Manages agent instances by name, providing the same getByName API.
 */

import { StandaloneAgent } from './agent-base';

type AgentFactory<T> = (name: string) => T;

export class AgentRegistry<T extends StandaloneAgent<unknown, Record<string, unknown>>> {
    private instances = new Map<string, T>();
    private factory: AgentFactory<T>;

    constructor(factory: AgentFactory<T>) {
        this.factory = factory;
    }

    getByName(name: string): T {
        let instance = this.instances.get(name);
        if (!instance) {
            instance = this.factory(name);
            this.instances.set(name, instance);
        }
        return instance;
    }

    get(name: string): T {
        return this.getByName(name);
    }

    has(name: string): boolean {
        return this.instances.has(name);
    }

    delete(name: string): boolean {
        return this.instances.delete(name);
    }

    getAll(): Map<string, T> {
        return new Map(this.instances);
    }
}
