#!/usr/bin/env node
/**
 * One-time R2 bucket CORS setup so the browser can PUT APKs directly to R2
 * (the direct-upload flow used by the dashboard's build uploader).
 *
 * Without this, the browser's cross-origin PUT to *.r2.cloudflarestorage.com is
 * blocked by CORS and uploads fail. The CLI / GitHub Action upload from Node and
 * do NOT need CORS — this is browser-only.
 *
 * Run with the same R2 env vars the web app uses:
 *   R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 * Optionally override the allowed origins:
 *   APP_ORIGINS="https://www.trycanopy.xyz,https://trycanopy.xyz"
 *
 *   node scripts/setup-r2-cors.mjs
 */
import {
    S3Client,
    PutBucketCorsCommand,
    GetBucketCorsCommand,
} from "@aws-sdk/client-s3";

const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET_NAME,
} = process.env;

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    console.error(
        "Missing one of R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME",
    );
    process.exit(1);
}

const origins = (
    process.env.APP_ORIGINS ??
    "https://www.trycanopy.xyz,https://trycanopy.xyz,http://localhost:3000"
)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

const client = new S3Client({
    region: "auto",
    endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
});

await client.send(
    new PutBucketCorsCommand({
        Bucket: R2_BUCKET_NAME,
        CORSConfiguration: {
            CORSRules: [
                {
                    AllowedOrigins: origins,
                    AllowedMethods: ["PUT", "GET", "HEAD"],
                    AllowedHeaders: ["*"],
                    ExposeHeaders: ["ETag"],
                    MaxAgeSeconds: 3600,
                },
            ],
        },
    }),
);

const check = await client.send(new GetBucketCorsCommand({ Bucket: R2_BUCKET_NAME }));
console.log(`✓ R2 CORS configured on bucket "${R2_BUCKET_NAME}" for:`);
for (const o of origins) console.log(`    ${o}`);
console.log("\nLive rules:");
console.log(JSON.stringify(check.CORSRules, null, 2));
