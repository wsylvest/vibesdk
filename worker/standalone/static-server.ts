/**
 * Static file server that replaces the Cloudflare ASSETS Fetcher binding.
 * Serves files from the dist/client directory for the SPA frontend.
 */

import { readFile } from 'node:fs/promises';
import { join, extname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import type { StaticAssetServer } from '../types/service-bindings';

const MIME_TYPES: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.map': 'application/json',
    '.webp': 'image/webp',
    '.avif': 'image/avif',
    '.txt': 'text/plain',
    '.xml': 'application/xml',
    '.webmanifest': 'application/manifest+json',
};

export class StaticFileServer implements StaticAssetServer {
    private distDir: string;

    constructor(distDir: string) {
        this.distDir = resolve(distDir);
    }

    private safePath(pathname: string): string | null {
        const resolved = resolve(this.distDir, '.' + pathname);
        if (!resolved.startsWith(this.distDir)) {
            return null;
        }
        return resolved;
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        const pathname = url.pathname;

        // Try the exact file path first
        const filePath = this.safePath(pathname);

        if (filePath && existsSync(filePath) && !filePath.endsWith('/')) {
            return this.serveFile(filePath);
        }

        // Try with index.html for directories
        if (pathname.endsWith('/')) {
            const dirIndex = this.safePath(pathname + 'index.html');
            if (dirIndex && existsSync(dirIndex)) {
                return this.serveFile(dirIndex);
            }
        }

        // SPA fallback: serve index.html for all non-file routes
        const indexPath = join(this.distDir, 'index.html');
        if (existsSync(indexPath)) {
            return this.serveFile(indexPath);
        }

        return new Response('Not Found', { status: 404 });
    }

    private async serveFile(filePath: string): Promise<Response> {
        try {
            const data = await readFile(filePath);
            const ext = extname(filePath).toLowerCase();
            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            return new Response(data, {
                status: 200,
                headers: {
                    'Content-Type': contentType,
                    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
                },
            });
        } catch {
            return new Response('Not Found', { status: 404 });
        }
    }
}
