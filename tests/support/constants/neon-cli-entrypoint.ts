/** Names how validation harnesses find the official Neon CLI without a user-specific path. @module neon-cli-entrypoint-constants */
export const NEON_CLI_ENTRYPOINT = {
  pathEnvironmentKey: "NEON_CLI_PATH",
  packageName: "neon",
  unixCommand: "neon",
  entrypointSegments: ["dist", "cli.js"],
  pnpmCommand: "pnpm",
  /** `npm_execpath` is pnpm's own binary or script when the tests run through pnpm. */
  pnpmExecutablePattern: /pnpm(\.exe|\.cjs|\.js)?$/i,
  javascriptEntrypointPattern: /\.(c|m)?js$/i,
  pnpmListArguments: ["ls", "--global", "--json", "--depth", "0"],
  pnpmListTimeoutMs: 30_000,
  /** pnpm reports Windows global paths in verbatim `\\?\` form. */
  windowsVerbatimPrefix: /^\\\\\?\\/,
} as const;
