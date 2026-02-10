/**
 * Filesystem-based storage that replaces R2Bucket for standalone mode.
 * Stores objects as files on the local filesystem.
 */

import { readFile, writeFile, mkdir, unlink, readdir, stat } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { existsSync } from 'node:fs';

export class FileSystemStorage {
    private basePath: string;

    constructor(basePath: string) {
        this.basePath = basePath;
    }

    private resolvePath(key: string): string {
        return join(this.basePath, key);
    }

    async get(key: string): Promise<{ text(): Promise<string>; arrayBuffer(): Promise<ArrayBuffer>; body: ReadableStream } | null> {
        const filePath = this.resolvePath(key);
        try {
            const data = await readFile(filePath);
            return {
                text: async () => data.toString('utf-8'),
                arrayBuffer: async () => new Uint8Array(data).buffer as ArrayBuffer,
                body: new ReadableStream({
                    start(controller) {
                        controller.enqueue(new Uint8Array(data));
                        controller.close();
                    }
                })
            };
        } catch {
            return null;
        }
    }

    async put(key: string, value: string | ArrayBuffer | ReadableStream): Promise<void> {
        const filePath = this.resolvePath(key);
        const dir = dirname(filePath);
        if (!existsSync(dir)) {
            await mkdir(dir, { recursive: true });
        }
        if (typeof value === 'string') {
            await writeFile(filePath, value, 'utf-8');
        } else if (value instanceof ArrayBuffer) {
            await writeFile(filePath, Buffer.from(value));
        } else {
            const reader = value.getReader();
            const chunks: Uint8Array[] = [];
            let done = false;
            while (!done) {
                const result = await reader.read();
                done = result.done;
                if (result.value) chunks.push(result.value);
            }
            await writeFile(filePath, Buffer.concat(chunks));
        }
    }

    async delete(key: string): Promise<void> {
        const filePath = this.resolvePath(key);
        try {
            await unlink(filePath);
        } catch {
            // ignore if file doesn't exist
        }
    }

    async list(options?: { prefix?: string }): Promise<{ objects: Array<{ key: string; size: number }> }> {
        const prefix = options?.prefix || '';
        const objects: Array<{ key: string; size: number }> = [];
        try {
            const files = await readdir(this.basePath, { recursive: true });
            for (const file of files) {
                const filePath = String(file);
                if (filePath.startsWith(prefix)) {
                    const fullPath = join(this.basePath, filePath);
                    const stats = await stat(fullPath);
                    if (stats.isFile()) {
                        objects.push({ key: filePath, size: stats.size });
                    }
                }
            }
        } catch {
            // directory may not exist
        }
        return { objects };
    }
}
