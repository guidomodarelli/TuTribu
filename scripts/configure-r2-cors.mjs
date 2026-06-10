#!/usr/bin/env node
/**
 * Applies the CORS rules the attachment upload flow needs on the Cloudflare R2
 * bucket: the browser uploads through a presigned PUT, and that cross-origin
 * PUT (with its `Content-Type` preflight) is rejected until the bucket allows
 * the app origins.
 *
 * Usage:
 *   node scripts/configure-r2-cors.mjs [origin ...]
 *
 * Origins default to `BETTER_AUTH_URL` plus the local dev origins. Credentials
 * come from the same `CLOUDFLARE_R2_*` / `CLOUDFLARE_ACCOUNT_ID` environment
 * variables the runtime adapter reads (loaded from `.env` via @next/env).
 *
 * @module configure-r2-cors
 */

import nextEnv from "@next/env";
import {
  GetBucketCorsCommand,
  PutBucketCorsCommand,
  S3Client,
} from "@aws-sdk/client-s3";

nextEnv.loadEnvConfig(process.cwd());

/** Local development origins always allowed alongside the deployed origins. */
const LOCAL_DEV_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"];

/** How long browsers may cache the preflight response, in seconds. */
const PREFLIGHT_MAX_AGE_SECONDS = 3600;

/**
 * Collects the allowed origins from CLI arguments and the environment.
 *
 * @returns {string[]} Unique list of origins to allow.
 */
function resolveAllowedOrigins() {
  const origins = new Set(LOCAL_DEV_ORIGINS);

  for (const argument of process.argv.slice(2)) {
    origins.add(argument.replace(/\/$/, ""));
  }

  const appUrl = process.env.BETTER_AUTH_URL?.trim();

  if (appUrl) {
    origins.add(new URL(appUrl).origin);
  }

  return [...origins];
}

async function main() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY?.trim();
  const bucketName = process.env.CLOUDFLARE_R2_BUCKET_NAME?.trim();

  if (!accountId || !accessKeyId || !secretAccessKey || !bucketName) {
    console.error(
      "Missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_R2_ACCESS_KEY_ID / CLOUDFLARE_R2_SECRET_ACCESS_KEY / CLOUDFLARE_R2_BUCKET_NAME"
    );
    process.exitCode = 1;
    return;
  }

  const allowedOrigins = resolveAllowedOrigins();
  const client = new S3Client({
    credentials: { accessKeyId, secretAccessKey },
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: "auto",
  });

  await client.send(
    new PutBucketCorsCommand({
      Bucket: bucketName,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["content-type"],
            AllowedMethods: ["PUT"],
            AllowedOrigins: allowedOrigins,
            MaxAgeSeconds: PREFLIGHT_MAX_AGE_SECONDS,
          },
        ],
      },
    })
  );

  const currentRules = await client.send(
    new GetBucketCorsCommand({ Bucket: bucketName })
  );

  console.log(
    `CORS configured on bucket "${bucketName}" for origins:`,
    allowedOrigins
  );
  console.log(JSON.stringify(currentRules.CORSRules, null, 2));
}

main().catch((error) => {
  console.error("Failed to configure R2 bucket CORS:", error.message);
  process.exitCode = 1;
});
