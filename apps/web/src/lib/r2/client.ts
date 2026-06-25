import {
    CopyObjectCommand,
    DeleteObjectCommand,
    GetObjectCommand,
    HeadObjectCommand,
    PutObjectCommand,
    S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/lib/env";

/**
 * Cloudflare R2 client (S3-compatible).
 *
 * Bucket is PRIVATE — every read goes through a server-validated signed URL.
 * Object keys follow the pattern: `{publisher_id}/{track_id}/{sha256_hash}.apk`
 * Keys are internal identifiers and MUST NOT be exposed to clients.
 */

const R2_ENDPOINT = `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

let cachedClient: S3Client | null = null;

function getR2Client(): S3Client {
    if (cachedClient) return cachedClient;
    cachedClient = new S3Client({
        region: "auto",
        endpoint: R2_ENDPOINT,
        credentials: {
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        },
        // R2 ignores checksum headers; explicit empty headers reduce noise
        forcePathStyle: false,
    });
    return cachedClient;
}

/** Builds the canonical R2 object key for an APK. */
export function buildApkKey(params: {
    publisherId: string;
    trackId: string;
    sha256: string;
}): string {
    return `${params.publisherId}/${params.trackId}/${params.sha256}.apk`;
}

/** Streams an APK upload directly to R2. Returns the key on success. */
export async function uploadApkToR2(params: {
    key: string;
    body: Uint8Array;
    contentType?: string;
}): Promise<void> {
    const client = getR2Client();
    await client.send(
        new PutObjectCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: params.key,
            Body: params.body,
            ContentType: params.contentType ?? "application/vnd.android.package-archive",
        }),
    );
}

/** Streams an APK body from R2 (server-side use only). */
export async function fetchApkFromR2(key: string): Promise<{
    body: ReadableStream<Uint8Array>;
    contentLength: number | undefined;
    contentType: string | undefined;
}> {
    const client = getR2Client();
    const result = await client.send(
        new GetObjectCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: key,
        }),
    );

    if (!result.Body) {
        throw new Error("R2_OBJECT_EMPTY");
    }

    // result.Body is a ReadableStream in Node 18+ / Web fetch environments
    return {
        body: result.Body.transformToWebStream(),
        contentLength: result.ContentLength,
        contentType: result.ContentType,
    };
}

/**
 * Downloads the full APK from R2 and returns it as a Buffer.
 * Use for malware scanning only — avoid for large downloads in hot paths.
 */
export async function downloadApkFromR2(key: string): Promise<Buffer> {
    const client = getR2Client();
    const result = await client.send(
        new GetObjectCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: key,
        }),
    );

    if (!result.Body) {
        throw new Error("R2_OBJECT_EMPTY");
    }

    const bytes = await result.Body.transformToByteArray();
    return Buffer.from(bytes);
}

/** Deletes an APK from R2 (called on track expiry/revocation). */
export async function deleteApkFromR2(key: string): Promise<void> {
    const client = getR2Client();
    await client.send(
        new DeleteObjectCommand({
            Bucket: env.R2_BUCKET_NAME,
            Key: key,
        }),
    );
}

/** Seconds a presigned upload URL stays valid. */
const UPLOAD_URL_TTL_SECONDS = 15 * 60;

/**
 * Presign a direct-to-R2 PUT URL so the browser can upload an APK straight to
 * storage, bypassing the serverless function's ~4.5MB request-body limit. No
 * Content-Type is bound, so the client may send the bytes with any/none. The
 * upload key MUST be publisher-scoped (the finalize route enforces this).
 */
export async function presignApkUpload(key: string): Promise<string> {
    const client = getR2Client();
    return getSignedUrl(
        client,
        new PutObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }),
        { expiresIn: UPLOAD_URL_TTL_SECONDS },
    );
}

/** HEAD an R2 object — returns its size + content type, or null if absent. */
export async function statApkInR2(
    key: string,
): Promise<{ size: number; contentType: string | undefined } | null> {
    const client = getR2Client();
    try {
        const r = await client.send(
            new HeadObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }),
        );
        return { size: r.ContentLength ?? 0, contentType: r.ContentType };
    } catch {
        return null;
    }
}

/** Server-side copy within R2 (no data flows through the serverless function). */
export async function copyApkInR2(params: {
    fromKey: string;
    toKey: string;
    contentType?: string;
}): Promise<void> {
    const client = getR2Client();
    await client.send(
        new CopyObjectCommand({
            Bucket: env.R2_BUCKET_NAME,
            CopySource: `${env.R2_BUCKET_NAME}/${params.fromKey}`,
            Key: params.toKey,
            ContentType: params.contentType ?? "application/vnd.android.package-archive",
            MetadataDirective: "REPLACE",
        }),
    );
}
