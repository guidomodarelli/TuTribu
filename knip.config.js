/** @module knip.config Project knip config: the shared golfo-lint defaults plus files and tools knip cannot trace. */
import { createKnipConfig } from "@golfo/lint/knip";

export default createKnipConfig({
  entry: [
    // Node hosts that the Neon deployment helpers bundle with esbuild from a path string.
    "tests/runtime/*/index.ts",
    // Preload modules that native suites pass to the Next.js server by path (`preloadModules`, `node --import`).
    "tests/support/admission-query-counter.mjs",
    "tests/support/native-*.mjs",
    // Child process scripts that tests spawn by path.
    "tests/support/process-fixtures/*.cjs",
  ],
  ignoreDependencies: [
    // Loaded by the Cloudflare Workers build (traced by `config/cloudflare-output-tracing.ts`), not imported.
    "pg-cloudflare",
    // Resolved from the Neon CLI installation (`createRequire(cli)("esbuild")`), not from this project.
    "esbuild",
  ],
  ignoreBinaries: [
    // System binary the Linux screen reader probes call to focus windows and type keys.
    "xdotool",
  ],
});
