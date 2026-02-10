/**
 * In-memory rate limit store - replaces Cloudflare Durable Object version.
 * Provides rate limiting using bucketed sliding window algorithm.
 */

export interface RateLimitBucket {
    count: number;
    timestamp: number;
}

export interface RateLimitState {
    buckets: Map<string, RateLimitBucket>;
    lastCleanup: number;
}

export interface RateLimitConfig {
    limit: number;
    period: number;
    burst?: number;
    burstWindow?: number;
    bucketSize?: number;
}

export interface RateLimitResult {
    success: boolean;
    remainingLimit?: number;
}

export class DORateLimitStore {
    private state: RateLimitState = {
        buckets: new Map(),
        lastCleanup: Date.now()
    };

    async increment(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
        const now = Date.now();
        const bucketSize = (config.bucketSize || 10) * 1000;
        const burstWindow = (config.burstWindow || 60) * 1000;
        const mainWindow = config.period * 1000;

        const currentBucket = Math.floor(now / bucketSize) * bucketSize;
        const bucketKey = `${key}:${currentBucket}`;

        if (now - this.state.lastCleanup > 5 * 60 * 1000) {
            this.cleanup(now, Math.max(mainWindow, burstWindow));
        }

        const mainBuckets = this.getBucketsInWindow(key, now, mainWindow, bucketSize);
        const burstBuckets = config.burst ? this.getBucketsInWindow(key, now, burstWindow, bucketSize) : [];

        const mainCount = mainBuckets.reduce((sum, bucket) => sum + bucket.count, 0);
        const burstCount = burstBuckets.reduce((sum, bucket) => sum + bucket.count, 0);

        if (mainCount >= config.limit) {
            return { success: false, remainingLimit: 0 };
        }

        if (config.burst && burstCount >= config.burst) {
            return { success: false, remainingLimit: 0 };
        }

        const existing = this.state.buckets.get(bucketKey);
        const newCount = (existing?.count || 0) + 1;

        this.state.buckets.set(bucketKey, {
            count: newCount,
            timestamp: now
        });

        return {
            success: true,
            remainingLimit: config.limit - mainCount - 1
        };
    }

    async getRemainingLimit(key: string, config: RateLimitConfig): Promise<number> {
        const now = Date.now();
        const bucketSize = (config.bucketSize || 10) * 1000;
        const mainWindow = config.period * 1000;

        const mainBuckets = this.getBucketsInWindow(key, now, mainWindow, bucketSize);
        const mainCount = mainBuckets.reduce((sum, bucket) => sum + bucket.count, 0);

        return Math.max(0, config.limit - mainCount);
    }

    async resetLimit(key?: string): Promise<void> {
        if (key) {
            const keysToDelete = Array.from(this.state.buckets.keys())
                .filter(bucketKey => bucketKey.startsWith(`${key}:`));

            for (const bucketKey of keysToDelete) {
                this.state.buckets.delete(bucketKey);
            }
        } else {
            this.state.buckets.clear();
        }
    }

    private getBucketsInWindow(key: string, now: number, windowMs: number, bucketSizeMs: number): RateLimitBucket[] {
        const buckets: RateLimitBucket[] = [];
        const windowStart = now - windowMs;

        for (let time = Math.floor(windowStart / bucketSizeMs) * bucketSizeMs; time <= now; time += bucketSizeMs) {
            const bucketKey = `${key}:${time}`;
            const bucket = this.state.buckets.get(bucketKey);
            if (bucket) {
                buckets.push(bucket);
            }
        }

        return buckets;
    }

    private cleanup(now: number, maxWindow: number): void {
        const cutoff = now - maxWindow;

        for (const [bucketKey, bucket] of this.state.buckets) {
            if (bucket.timestamp < cutoff) {
                this.state.buckets.delete(bucketKey);
            }
        }

        this.state.lastCleanup = now;
    }
}
