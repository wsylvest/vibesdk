/**
 * Observability - Sentry integration for standalone Node.js
 * Replaces @sentry/cloudflare with console-based logging.
 * To enable full Sentry, install @sentry/node and initialize here.
 */

import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../types/appenv';

export function sentryOptions(_env: Env): Record<string, unknown> {
    return {};
}

export function initHonoSentry(app: Hono<AppEnv>): void {
    app.onError((err, c) => {
        console.error('[Sentry] Unhandled error:', err);
        if (err instanceof HTTPException) {
            return err.getResponse();
        }
        return c.json({ error: 'Internal server error' }, 500);
    });
}

export type SecurityEventType =
    | 'csrf_violation'
    | 'rate_limit_exceeded'
    | 'auth_violation'
    | 'oauth_state_mismatch'
    | 'jwt_invalid'
    | string;

export type SecuritySeverity = 'debug' | 'info' | 'warning' | 'error' | 'fatal';

export interface SecurityEventOptions {
    level?: SecuritySeverity;
    error?: unknown;
}

export function captureSecurityEvent(
    type: SecurityEventType,
    data: Record<string, unknown> = {},
    options: SecurityEventOptions = {},
): void {
    const level = options.level ?? 'warning';
    console.warn(`[security:${level}] ${type}`, data);
    if (options.error) {
        console.error(`[security] Error:`, options.error);
    }
}

export function captureException(error: Error): void {
    console.error('[Sentry] Exception:', error);
}
