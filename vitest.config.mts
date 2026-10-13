/** Runs the existing application suites with real React and framework adapters. */
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react({ compiler: true })],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // Next's build-time marker has no runtime behavior in server integration tests.
      "server-only": "next/dist/compiled/server-only/empty.js",
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    clearMocks: false,
    // RTL's polling must progress when a behavior test enables fake timers.
    fakeTimers: { shouldAdvanceTime: true },
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    exclude: ["**/node_modules/**", "**/.claude/**", "**/.next/**"],
    testTimeout: 30_000,
    maxWorkers: 2,
    css: { modules: { classNameStrategy: "non-scoped" } },
    server: { deps: { inline: ["beez-ui", "@next/env"] } },
  },
});
