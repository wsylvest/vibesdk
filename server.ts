/**
 * Standalone Node.js server entrypoint.
 * Replaces the Cloudflare Workers runtime with Hono on Node.js.
 */

import { serve } from '@hono/node-server';
import { createStandaloneEnv } from './worker/standalone/env-factory';
import { setGlobalEnv } from './worker/standalone/env-global';
import { createApp } from './worker/app';
import { getPreviewDomain } from './worker/utils/urls';

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
    console.error('Warning: CUSTOM_DOMAIN is not configured. Using localhost.');
}

// Create the Hono app
const app = createApp(env);

console.log(`Starting standalone server on ${HOST}:${PORT}`);
console.log(`Environment: ${env.ENVIRONMENT}`);
console.log(`Custom domain: ${env.CUSTOM_DOMAIN}`);

serve({
    fetch: (req) => app.fetch(req, env),
    port: PORT,
    hostname: HOST,
}, (info) => {
    console.log(`Server running at http://${info.address}:${info.port}`);
});
