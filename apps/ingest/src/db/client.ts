import { Client } from "pg";
import type { Env } from "../types";

/**
 * Creates a new pg Client for each request via Cloudflare Hyperdrive.
 *
 * IMPORTANT: Do NOT use pg.Pool here. Hyperdrive maintains the underlying
 * connection pool globally — creating a new Client per request is cheap.
 * Using Pool would create a second pool layered on top of Hyperdrive's pool,
 * wasting connections and memory.
 *
 * Pattern per Cloudflare docs:
 *   https://developers.cloudflare.com/hyperdrive/examples/supabase/
 */
export function createDbClient(env: Env): Client {
    return new Client({
        connectionString: env.HYPERDRIVE.connectionString,
        // Bound every stage so a saturated pool FAILS FAST (-> 500 -> the SDK
        // re-queues and retries) instead of hanging the invocation for 30s+.
        // A hung invocation is worse than a fast failure: Cloudflare eventually
        // cancels it, the `finally { client.end() }` may not run, and the pooled
        // connection leaks — which exhausts the pool further and cascades into
        // "every write hangs". Fast failure keeps the pool healthy.
        connectionTimeoutMillis: 6000,
        query_timeout: 8000,
    });
}

/**
 * Runs a database operation inside a managed client lifecycle.
 * Always connects, runs the operation, then ends the client.
 *
 * @param env - Worker bindings (HYPERDRIVE)
 * @param fn - Async operation to run with the connected client
 */
export async function withDb<T>(env: Env, fn: (client: Client) => Promise<T>): Promise<T> {
    const client = createDbClient(env);
    await client.connect();
    try {
        return await fn(client);
    } finally {
        await client.end();
    }
}
