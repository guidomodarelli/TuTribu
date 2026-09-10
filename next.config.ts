import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { NextConfig } from "next";
import { initializeOpenNextCloudflareForDev } from "./config/cloudflare-dev-runtime";
import { getCloudflareOutputFileTracingIncludes } from "./config/cloudflare-output-tracing";
import { getLegacyRedirects } from "./config/legacy-redirects";

/**
 * Resolves the workspace root as the nearest ancestor that actually holds the
 * installed dependencies (`node_modules/next`). In a git worktree the source
 * lives under `.claude/worktrees/<name>` while `node_modules` stays in the main
 * checkout, so the root must climb up to where dependencies are resolvable;
 * pointing it at the worktree itself leaves Turbopack unable to find `next`.
 * When run from the main checkout the very first directory already matches.
 */
function resolveWorkspaceRoot(startDir: string): string {
  let currentDir = startDir;

  while (!existsSync(join(currentDir, "node_modules", "next"))) {
    const parentDir = dirname(currentDir);

    if (parentDir === currentDir) {
      return startDir;
    }

    currentDir = parentDir;
  }

  return currentDir;
}

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1", "dev-tutribu.app"],
  cacheComponents: true,
  // Type-check the same product scope as `pnpm run typecheck`. Since 16.3 the
  // build checks every file `tsconfig.json` includes, which would pull in the
  // Vitest suites that run through Vite and are not part of the type-check gate.
  typescript: {
    tsconfigPath: "tsconfig.typecheck.json",
  },
  // Keep the shared UI and storage package compatible with the Next build.
  transpilePackages: ["files-sdk", "beez-ui"],
  experimental: {
    // TypeScript 7 exposes a native CLI instead of the legacy compiler API.
    useTypeScriptCli: true,
    optimizePackageImports: ["beez-ui"],
  },
  // Pin the workspace root explicitly. A checked-in `pnpm-workspace.yaml` exists
  // in both the main checkout and every git worktree, so Next.js otherwise infers
  // the root and warns about multiple lockfiles. The root must be where
  // dependencies are installed so Turbopack can resolve `next`.
  turbopack: {
    root: resolveWorkspaceRoot(__dirname),
  },
  outputFileTracingIncludes: getCloudflareOutputFileTracingIncludes(),
  redirects: getLegacyRedirects,
  images: {
    remotePatterns: [
      {
        hostname: "imagedelivery.net",
        pathname: "/**",
        port: "",
        protocol: "https",
        search: "",
      },
    ],
  },
};

void initializeOpenNextCloudflareForDev();

export default nextConfig;
