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
