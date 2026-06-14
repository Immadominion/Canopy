import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { timing } from "hono/timing";

import { eventsRouter } from "./routes/events";
import { crashesRouter } from "./routes/crashes";
import type { Env } from "./types";

const app = new Hono<{ Bindings: Env }>();

// ─── Global middleware ───

// Security headers on every response
app.use("*", secureHeaders());

// Request timing (visible in CF dashboard)
app.use("*", timing());

// CORS — only allow requests from SDK (no browser direct access)
app.use(
    "*",
    cors({
        origin: (origin) => {
            // SDK sends from app context — no Origin header from native apps
            // Browser testing allowed from canopy.dev
            if (!origin || origin.endsWith(".trycanopy.xyz")) return origin.length > 0 ? origin : "";
            return "";
        },
        allowMethods: ["POST", "GET", "OPTIONS"],
        allowHeaders: ["Content-Type", "Authorization"],
        maxAge: 86400,
    }),
);

// ─── Routes ───

app.get("/health", (c) => c.json({ status: "ok", service: "canopy-ingest" }));

app.route("/v1/events", eventsRouter);
app.route("/v1/crashes", crashesRouter);

// 404 for everything else — no route enumeration
app.notFound((c) =>
    c.json({ error: { code: "NOT_FOUND", message: "Not found" } }, 404),
);

// ─── Rate limiter Durable Object ───

export { RateLimiter } from "./durable-objects/rate-limiter";

export default app;
