/**
 * Stub types for @cloudflare/sandbox in standalone mode.
 * The SandboxSdkClient won't be used in standalone mode (uses RemoteSandboxServiceClient instead),
 * but these stubs allow the module to compile.
 */

export interface ReadFileResult {
    success: boolean;
    exitCode: number;
    content: string;
}

export interface ExecuteResponse {
    exitCode: number;
    stdout: string;
    stderr: string;
}

export interface ProcessHandle {
    id: string;
    status: string;
}

export interface LogEvent {
    data: string;
    match(regex: RegExp): RegExpMatchArray | null;
}

export interface WriteFileResult {
    success: boolean;
    path: string;
}

export interface SandboxInstance {
    exec(command: string, options?: { timeout?: number; cwd?: string }): Promise<ExecuteResponse>;
    readFile(path: string): Promise<ReadFileResult>;
    writeFile(path: string, content: string): Promise<WriteFileResult>;
    startProcess(command: string, options?: { cwd?: string }): Promise<ProcessHandle>;
    getProcess(id: string): Promise<ProcessHandle>;
    streamProcessLogs(id: string): Promise<ReadableStream>;
    killProcess(id: string): Promise<void>;
    setEnvVars(vars: Record<string, string>): Promise<void>;
    exposePort(port: number, options?: { hostname?: string }): Promise<{ url: string }>;
    unexposePort(port: number): Promise<void>;
}

export function getSandbox(_namespace: unknown, _id: string): SandboxInstance {
    throw new Error(
        'SandboxSdkClient is not available in standalone mode. Use SANDBOX_SERVICE_TYPE=runner.'
    );
}

export function parseSSEStream<T>(_stream: ReadableStream): AsyncIterable<{ data: T }> {
    throw new Error('parseSSEStream is not available in standalone mode.');
}

/**
 * Stub Sandbox class (Durable Object replacement).
 * Not functional in standalone mode.
 */
export class Sandbox {
    fetch(_request: Request): Promise<Response> {
        return Promise.resolve(new Response('Sandbox Durable Object not available in standalone mode', { status: 501 }));
    }
}
