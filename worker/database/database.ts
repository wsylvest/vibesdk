/**
 * Core Database Service
 * Provides database connection using libsql for standalone mode.
 * libsql provides async SQLite access compatible with the D1 query patterns.
 */

import { drizzle } from 'drizzle-orm/libsql';
import { createClient, Client } from '@libsql/client';
import * as schema from './schema';

import type { HealthStatusResult } from './types';

// Re-export the database type for use in services
export type DatabaseInstance = ReturnType<typeof drizzle<typeof schema>>;

// ========================================
// TYPE DEFINITIONS AND INTERFACES
// ========================================

export type {
    User, NewUser, Session, NewSession,
    App, NewApp,
    AppLike, NewAppLike, AppComment, NewAppComment,
    AppView, NewAppView, OAuthState, NewOAuthState,
    SystemSetting, NewSystemSetting,
    UserSecret, NewUserSecret,
    UserModelConfig, NewUserModelConfig,
} from './schema';


/**
 * Core Database Service - Connection and Base Operations
 *
 * Provides database connection, shared utilities, and core operations.
 * Domain-specific operations are handled by dedicated service classes.
 */
export class DatabaseService {
    public readonly db: DatabaseInstance;
    private static client: Client | null = null;

    constructor(_env: Env) {
        if (!DatabaseService.client) {
            const dbPath = process.env.DATABASE_PATH || '.data/vibesdk.db';
            DatabaseService.client = createClient({
                url: `file:${dbPath}`,
            });
        }
        this.db = drizzle(DatabaseService.client, { schema });
    }

    /**
     * Get a read-optimized database connection.
     * In standalone mode, this returns the same connection (no read replicas).
     */
    public getReadDb(_strategy: 'fast' | 'fresh' = 'fast'): DatabaseInstance {
        return this.db;
    }

    // ========================================
    // UTILITY METHODS
    // ========================================

    async getHealthStatus(): Promise<HealthStatusResult> {
        try {
            await this.db.select().from(schema.systemSettings).limit(1);
            return {
                healthy: true,
                timestamp: new Date().toISOString(),
            };
        } catch {
            return {
                healthy: false,
                timestamp: new Date().toISOString(),
            };
        }
    }

    static close(): void {
        if (DatabaseService.client) {
            DatabaseService.client.close();
            DatabaseService.client = null;
        }
    }
}

/**
 * Factory function to create database service instance
 */
export function createDatabaseService(env: Env): DatabaseService {
    return new DatabaseService(env);
}
