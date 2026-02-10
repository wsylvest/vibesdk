/**
 * In-memory rate limiter that implements the Cloudflare RateLimit binding interface.
 * Uses a simple sliding window counter approach.
 */

interface RateLimitEntry {
    count: number;
    windowStart: number;
}

export class InMemoryRateLimiter {
    private entries = new Map<string, RateLimitEntry>();
    private readonly windowMs: number;
    private readonly maxRequests: number;

    constructor(maxRequests = 100, windowSeconds = 60) {
        this.maxRequests = maxRequests;
        this.windowMs = windowSeconds * 1000;
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
}
