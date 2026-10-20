/**
 * Locates the installed official Neon CLI entrypoint for SQL and Node-host validation harnesses.
 *
 * @module neon-cli-entrypoint
 */
import { execFile } from "node:child_process";
import { access, realpath } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { NEON_CLI_ENTRYPOINT } from "./constants/neon-cli-entrypoint";

const runExecutable = promisify(execFile);

type Environment = Readonly<Record<string, string | undefined>>;

/** @param path - Candidate file. @returns Whether it exists; only a missing file counts as absent. */
async function exists(path: string): Promise<boolean> {
  try { await access(path); return true; } catch (error) {
    if (error instanceof Error && "code" in error && (error.code === "ENOENT" || error.code === "ENOTDIR")) return false;
    throw error;
  }
}

/**
 * Reads the CLI entrypoint from a `pnpm ls -g --json --depth 0` listing, whose per-package directories pnpm owns.
 * @param listing - Raw stdout of the official listing command.
 * @returns The verified entrypoint, or `undefined` when the listing has no `neon` package or its file is missing.
 */
export async function readNeonCliEntrypointFromPnpmListing(listing: string): Promise<string | undefined> {
  let parsed: unknown;
  try { parsed = JSON.parse(listing); } catch { return undefined; }
  if (!Array.isArray(parsed)) return undefined;
  for (const project of parsed) {
    const packagePath: unknown = project?.dependencies?.[NEON_CLI_ENTRYPOINT.packageName]?.path;
    if (typeof packagePath !== "string") continue;
    const entrypoint = join(packagePath.replace(NEON_CLI_ENTRYPOINT.windowsVerbatimPrefix, ""), ...NEON_CLI_ENTRYPOINT.entrypointSegments);
    if (await exists(entrypoint)) return entrypoint;
  }
  return undefined;
}

/** @param environment - Process environment. @returns The CLI of a pnpm global install, or `undefined` when pnpm is unavailable or has none. */
async function findPnpmGlobalEntrypoint(environment: Environment): Promise<string | undefined> {
  const execPath = environment.npm_execpath;
  const pnpm = execPath && NEON_CLI_ENTRYPOINT.pnpmExecutablePattern.test(execPath) ? execPath : NEON_CLI_ENTRYPOINT.pnpmCommand;
  const [command, prefix] = NEON_CLI_ENTRYPOINT.javascriptEntrypointPattern.test(pnpm) ? [process.execPath, [pnpm]] : [pnpm, []];
  try {
    const { stdout } = await runExecutable(command, [...prefix, ...NEON_CLI_ENTRYPOINT.pnpmListArguments], { windowsHide: true, timeout: NEON_CLI_ENTRYPOINT.pnpmListTimeoutMs, env: { ...environment } as NodeJS.ProcessEnv });
    return await readNeonCliEntrypointFromPnpmListing(stdout);
  } catch (error) {
    if (error instanceof Error && "code" in error && (error.code === "ENOENT" || typeof error.code === "number")) return undefined;
    throw error;
  }
}

/**
 * Resolves the official CLI in order: explicit `NEON_CLI_PATH`, an npm-style global install on `PATH`, a Unix `neon` link on `PATH`, then pnpm's own global listing.
 * @param environment - Process environment; defaults to the current one.
 * @returns A verified JavaScript entrypoint to run with the current Node executable.
 * @throws When an explicit path is missing, or no installation is found.
 */
export async function resolveNeonCliEntrypoint(environment: Environment = process.env): Promise<string> {
  const explicit = environment[NEON_CLI_ENTRYPOINT.pathEnvironmentKey];
  if (explicit) {
    if (!await exists(explicit)) throw new Error(`NeonCliEntrypoint.resolve failed: explicit_path_missing; unset ${NEON_CLI_ENTRYPOINT.pathEnvironmentKey} or point it at an installed cli.js`);
    return explicit;
  }
  for (const directory of (environment.PATH ?? environment.Path ?? "").split(delimiter).filter(Boolean)) {
    const entrypoint = join(directory, "node_modules", NEON_CLI_ENTRYPOINT.packageName, ...NEON_CLI_ENTRYPOINT.entrypointSegments);
    if (await exists(entrypoint)) return entrypoint;
    if (process.platform !== "win32") {
      try { return await realpath(join(directory, NEON_CLI_ENTRYPOINT.unixCommand)); } catch (error) {
        if (!(error instanceof Error) || !("code" in error) || error.code !== "ENOENT") throw error;
      }
    }
  }
  const pnpmEntrypoint = await findPnpmGlobalEntrypoint(environment);
  if (pnpmEntrypoint) return pnpmEntrypoint;
  throw new Error(`NeonCliEntrypoint.resolve failed: neon_cli_unavailable; install it with "pnpm add -g ${NEON_CLI_ENTRYPOINT.packageName}" or set ${NEON_CLI_ENTRYPOINT.pathEnvironmentKey}`);
}
