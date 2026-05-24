import { NextResponse } from "next/server";

/**
 * Canonical API error shape (see copilot-instructions §7):
 *   { "error": { "code": "SCREAMING_SNAKE_CASE", "message": "...", "details": {} } }
 */
export interface ApiErrorBody {
    error: {
        code: string;
        message: string;
        details?: Record<string, unknown>;
    };
}

export function apiError(
    code: string,
    message: string,
    status: number,
    details?: Record<string, unknown>,
): NextResponse<ApiErrorBody> {
    return NextResponse.json<ApiErrorBody>(
        { error: { code, message, ...(details ? { details } : {}) } },
        { status },
    );
}

/**
 * 404 used in place of 403 for any beta track that the caller has no right to know
 * exists. INVARIANT 5: beta tracks are never publicly discoverable.
 */
export function notFound(): NextResponse<ApiErrorBody> {
    return apiError("NOT_FOUND", "Resource not found", 404);
}
