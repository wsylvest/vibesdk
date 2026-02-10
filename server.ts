/**
 * Standalone Node.js server entrypoint.
 * Replaces the Cloudflare Workers runtime with Hono on Node.js.
 */

import { serve } from '@hono/node-server';
import { createStandaloneEnv } from './worker/standalone/env-factory';
import { setGlobalEnv } from './worker/standalone/env-global';
import { createApp } from './worker/app';
import { getPreviewDomain } from './worker/utils/urls';
import { getAgentByName, handleUpgrade } from './worker/standalone/agents-compat';
import type { SmartCodeGeneratorAgent } from './worker/agents/core/smartGeneratorAgent';

// Load .env file in development
import 'dotenv/config';

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '0.0.0.0';

// Create standalone environment and register it globally
const env = createStandaloneEnv();
setGlobalEnv(env);

// Validate critical config
const previewDomain = getPreviewDomain(env);
if (!previewDomain || previewDomain.trim() === '') {
    console.warn('Warning: CUSTOM_DOMAIN is not configured. Using localhost.');
}

// Create the Hono app
const app = createApp(env);

console.log(`Starting standalone server on ${HOST}:${PORT}`);
console.log(`Environment: ${env.ENVIRONMENT}`);
console.log(`Custom domain: ${env.CUSTOM_DOMAIN}`);

const server = serve({
    fetch: (req) => app.fetch(req, env),
    port: PORT,
    hostname: HOST,
}, (info) => {
    console.log(`Server running at http://${info.address}:${info.port}`);
});

// Handle WebSocket upgrades by routing to the correct agent instance.
// The URL pattern matches /api/agent/:agentId/ws
const WS_PATH_RE = /^\/api\/agent\/([^/]+)\/ws/;

(server as import('node:http').Server).on('upgrade', (request, socket, head) => {
    const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
    const match = WS_PATH_RE.exec(url.pathname);

    if (!match) {
        socket.destroy();
        return;
    }

    const agentId = match[1];
    try {
        const agent = getAgentByName<Env, SmartCodeGeneratorAgent>(env.CodeGenObject, agentId);
        handleUpgrade(agent, request, socket, head);
    } catch (err) {
        console.error(`[WS Upgrade] Agent ${agentId} not found:`, err);
        socket.destroy();
    }
});
