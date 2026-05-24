import { updateSession } from "@/lib/supabase/middleware";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
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
         */
        "/((?!_next/static|_next/image|favicon.ico|install/|api/health).*)",
    ],
};
