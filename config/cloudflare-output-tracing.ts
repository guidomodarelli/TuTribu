import type { NextConfig } from "next";

const ALL_SERVER_ROUTES = "/*";

export const PG_CLOUDFLARE_TRACE_FILES = [
  "node_modules/pg-cloudflare/dist/**/*",
  "node_modules/pg-cloudflare/esm/**/*",
] as const;

/**
 * Includes runtime files that Next.js tracing can miss but OpenNext needs.
 */
export const cloudflareOutputFileTracingIncludes = {
  [ALL_SERVER_ROUTES]: [...PG_CLOUDFLARE_TRACE_FILES],
} satisfies NonNullable<NextConfig["outputFileTracingIncludes"]>;
