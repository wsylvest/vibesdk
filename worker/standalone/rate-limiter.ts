/**
 * In-memory rate limiter that implements the Cloudflare RateLimit binding interface.
 * Uses a simple sliding window counter approach with periodic cleanup.
 */

import type { RateLimitBinding } from '../types/service-bindings';

interface RateLimitEntry {
    count: number;
    windowStart: number;
}

const CLEANUP_INTERVAL_MS = 60_000;

export class InMemoryRateLimiter implements RateLimitBinding {
    private entries = new Map<string, RateLimitEntry>();
    private readonly windowMs: number;
    private readonly maxRequests: number;
    private cleanupTimer: ReturnType<typeof setInterval>;

    constructor(maxRequests = 100, windowSeconds = 60) {
        this.maxRequests = maxRequests;
        this.windowMs = windowSeconds * 1000;

        this.cleanupTimer = setInterval(() => this.cleanup(), CLEANUP_INTERVAL_MS);
        // Allow the process to exit even if this timer is still running
        if (this.cleanupTimer.unref) this.cleanupTimer.unref();
    }

    async limit(options: { key: string }): Promise<{ success: boolean }> {
        const now = Date.now();
        const entry = this.entries.get(options.key);

        if (!entry || now - entry.windowStart > this.windowMs) {
            this.entries.set(options.key, { count: 1, windowStart: now });
            return { success: true };
        }

        entry.count++;
        if (entry.count > this.maxRequests) {
            return { success: false };
        }
        return { success: true };
    }

    private cleanup(): void {
        const now = Date.now();
        for (const [key, entry] of this.entries) {
            if (now - entry.windowStart > this.windowMs) {
                this.entries.delete(key);
            }
        }
    }
}
