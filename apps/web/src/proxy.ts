import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

/**
 * Renamed from `middleware.ts` (Next.js 16). `proxy.ts` runs on the **Node.js
 * runtime**, so server-side fetches — e.g. the Supabase session refresh against
 * a local `127.0.0.1:54321` instance — work reliably. The old Edge-runtime
 * middleware produced repeated "fetch failed" noise in local dev because its
 * sandboxed fetch couldn't reach the local Supabase.
 */
export async function proxy(request: NextRequest) {
    return updateSession(request);
}

export const config = {
    matcher: [
        /*
         * Match all request paths EXCEPT:
         * - _next/static (static files)
         * - _next/image (image optimization)
         * - favicon.ico
         * - Public install pages (/install/:trackId — tester flow, no auth required)
         * - API health check
         * - APK upload (large multipart body; the route does its own auth, and
         *   running the proxy here caps the request body at 10MB → truncated APK)
         */
        "/((?!_next/static|_next/image|favicon.ico|install/|api/health|api/v1/beta/upload).*)",
    ],
};
