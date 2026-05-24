import type { CanopyConfig } from "./config.js";
import { getApiUrl, requireApiKey } from "./config.js";

export interface ApiError {
    code: string;
    message: string;
    details?: Record<string, unknown>;
}

export class CanopyApiError extends Error {
    readonly code: string;
    readonly statusCode: number;
    readonly details: Record<string, unknown> | undefined;

    constructor(statusCode: number, error: ApiError) {
        super(error.message);
        this.name = "CanopyApiError";
        this.code = error.code;
        this.statusCode = statusCode;
        if (error.details !== undefined) {
            this.details = error.details;
        }
    }
}

async function handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
        let body: { error?: ApiError } = {};
        try {
            body = (await res.json()) as { error?: ApiError };
        } catch {
            // ignore parse error
        }
        const err = body.error ?? {
            code: "HTTP_ERROR",
            message: `HTTP ${res.status.toString()} ${res.statusText}`,
        };
        throw new CanopyApiError(res.status, err);
    }
    return res.json() as Promise<T>;
}

export function createApiClient(config: CanopyConfig) {
    const baseUrl = getApiUrl(config);
    const apiKey = requireApiKey(config);

    const headers = {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
    };

    return {
        async get<T>(path: string): Promise<T> {
            const res = await fetch(`${baseUrl}${path}`, { headers });
            return handleResponse<T>(res);
        },

        async post<T>(path: string, body: unknown): Promise<T> {
            const res = await fetch(`${baseUrl}${path}`, {
                method: "POST",
                headers,
                body: JSON.stringify(body),
            });
            return handleResponse<T>(res);
        },

        async postForm<T>(path: string, form: FormData): Promise<T> {
            // Don't include Content-Type header for FormData — let fetch set the boundary
            const res = await fetch(`${baseUrl}${path}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${apiKey}` },
                body: form,
            });
            return handleResponse<T>(res);
        },

        async patch<T>(path: string, body: unknown): Promise<T> {
            const res = await fetch(`${baseUrl}${path}`, {
                method: "PATCH",
                headers,
                body: JSON.stringify(body),
            });
            return handleResponse<T>(res);
        },

        async delete<T>(path: string): Promise<T> {
            const res = await fetch(`${baseUrl}${path}`, {
                method: "DELETE",
                headers,
            });
            return handleResponse<T>(res);
        },
    };
}
