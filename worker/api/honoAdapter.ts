import { Context } from 'hono';
import { RouteContext } from './types/route-context';
import { AppEnv } from '../types/appenv';
import { BaseController } from './controllers/baseController';
import { enforceAuthRequirement } from '../middleware/auth/routeAuth';
/*
* This is a simple adapter to convert Hono context to our base controller's expected arguments
*/

/**
 * Standalone execution context stub replacing Cloudflare's ExecutionContext.
 */
interface StandaloneExecutionContext {
    waitUntil(promise: Promise<unknown>): void;
    passThroughOnException(): void;
}

const standaloneCtx: StandaloneExecutionContext = {
    waitUntil(_promise: Promise<unknown>): void {
        // In standalone mode, we don't need to extend request lifetime
        // The Node.js process persists beyond the request
    },
    passThroughOnException(): void {
        // No-op in standalone mode
    },
};

type ControllerMethod<T extends BaseController> = (
    this: T,
    request: Request,
    env: Env,
    ctx: StandaloneExecutionContext,
    context: RouteContext
) => Promise<Response>;

export function adaptController<T extends BaseController>(
    controller: T,
    method: ControllerMethod<T>
) {
    return async (c: Context<AppEnv>): Promise<Response> => {
        const authResult = await enforceAuthRequirement(c);
        if (authResult) {
            return authResult;
        }

        const routeContext: RouteContext = {
            user: c.get('user'),
            sessionId: c.get('sessionId'),
            config: c.get('config'),
            pathParams: c.req.param(),
            queryParams: new URL(c.req.url).searchParams,
        };
        return await method.call(
            controller,
            c.req.raw,
            c.env,
            standaloneCtx,
            routeContext
        );
    };
}
