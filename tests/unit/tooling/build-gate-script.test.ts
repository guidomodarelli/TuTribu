/** @vitest-environment node */

import { afterEach, describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

/** Real Git fixtures can exceed the default timeout on Windows. */
const GIT_FIXTURE_TEST_TIMEOUT_MS = 60_000;

/** Exit code Vercel reads as "skip the build". */
const SKIP_BUILD_EXIT_CODE = 0;

/** Exit code Vercel reads as "build". */
const BUILD_EXIT_CODE = 1;

/** Wrapper declared as the Vercel `ignoreCommand`. */
const IGNORE_BUILD_SCRIPT = "scripts/ignore-build.sh";

/** beez-rp range declared by every fixture, as the real package.json does. */
const FIXTURE_BEEZ_RP_RANGE = "^0.1.1";

/** Installed beez-rp CLI that the `npx` stub runs, so the decision is the real one. */
const BEEZ_RP_BIN = path.join(path.dirname(createRequire(import.meta.url).resolve("beez-rp/package.json")), "bin", "beez-rp.js");

/**
 * Stand-in for `npx`: records its arguments and, depending on `NPX_STUB_MODE`,
 * runs the installed beez-rp gate or simulates an npx or network failure.
 */
const NPX_STUB = `#!/bin/bash
printf '%s\\n' "$@" > "$NPX_ARGUMENTS_FILE"
case "$NPX_STUB_MODE" in
  real) exec node "$BEEZ_RP_BIN" "\${@:3}" ;;
  network-failure) echo "npm error code ENOTFOUND" >&2; exit 1 ;;
  build-then-failure) echo "BUILD"; exit 1 ;;
esac
`;

/** Git variables exported by hooks that would redirect fixture commands. */
const GIT_HOOK_ENVIRONMENT_VARIABLES = ["GIT_DIR", "GIT_INDEX_FILE", "GIT_WORK_TREE", "GIT_PREFIX"];

type NpxStubMode = "real" | "network-failure" | "build-then-failure";

const temporaryDirectories: string[] = [];

function createFixtureEnvironment(): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = { ...process.env };

  for (const variableName of GIT_HOOK_ENVIRONMENT_VARIABLES) {
    delete environment[variableName];
  }

  return environment;
}

function runGit(gitArguments: string[], workingDirectory: string): void {
  const result = spawnSync("git", gitArguments, { cwd: workingDirectory, encoding: "utf8", env: createFixtureEnvironment() });

  if (result.status !== 0) {
    throw new Error(`git ${gitArguments.join(" ")} failed: ${result.stderr}`);
  }
}

/**
 * Creates a repository with the wrapper and one commit per `package.json` version.
 *
 * @param versions - Versions in commit order.
 * @param declaresBeezRp - Whether the manifests declare the beez-rp devDependency.
 */
function createRepositoryWithVersions(versions: string[], declaresBeezRp = true): string {
  const repositoryRoot = mkdtempSync(path.join(os.tmpdir(), "build-gate-"));
  temporaryDirectories.push(repositoryRoot);
  mkdirSync(path.join(repositoryRoot, "scripts"), { recursive: true });
  cpSync(path.resolve(IGNORE_BUILD_SCRIPT), path.join(repositoryRoot, IGNORE_BUILD_SCRIPT));
  runGit(["init", "--quiet"], repositoryRoot);
  runGit(["config", "user.email", "release@example.test"], repositoryRoot);
  runGit(["config", "user.name", "Release Fixture"], repositoryRoot);
  runGit(["config", "core.autocrlf", "false"], repositoryRoot);

  for (const version of versions) {
    const manifest = declaresBeezRp ? { name: "fixture", version, devDependencies: { "beez-rp": FIXTURE_BEEZ_RP_RANGE } } : { name: "fixture", version };
    writeFileSync(path.join(repositoryRoot, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
    runGit(["add", "-A"], repositoryRoot);
    runGit(["commit", "--quiet", "--allow-empty", "-m", version], repositoryRoot);
  }

  return repositoryRoot;
}

/**
 * Resolves the `bash` that runs the Vercel `ignoreCommand`. On Windows `bash`
 * on PATH is usually WSL, which keeps fixture files locked, so the Git Bash
 * shipped next to `git` is used instead.
 */
function resolveBashExecutable(): string {
  if (process.platform !== "win32") {
    return "bash";
  }

  const gitExecPath = spawnSync("git", ["--exec-path"], { encoding: "utf8" }).stdout.trim();
  const gitBash = path.resolve(gitExecPath, "..", "..", "..", "bin", "bash.exe");

  if (!existsSync(gitBash)) {
    throw new Error(`build-gate test: Git Bash not found at ${gitBash}`);
  }

  return gitBash;
}

/** Runs the wrapper exactly as `vercel.json` declares it, with the `npx` stub first on PATH. */
function runIgnoreCommand(repositoryRoot: string, npxStubMode: NpxStubMode) {
  const stubDirectory = mkdtempSync(path.join(os.tmpdir(), "npx-stub-"));
  temporaryDirectories.push(stubDirectory);
  writeFileSync(path.join(stubDirectory, "npx"), NPX_STUB, { mode: 0o755 });
  const argumentsFile = path.join(stubDirectory, "arguments.txt");
  const environment = createFixtureEnvironment();
  const result = spawnSync(resolveBashExecutable(), [IGNORE_BUILD_SCRIPT], {
    cwd: repositoryRoot,
    encoding: "utf8",
    env: {
      ...environment,
      PATH: `${stubDirectory}${path.delimiter}${environment.PATH ?? ""}`,
      NPX_STUB_MODE: npxStubMode,
      NPX_ARGUMENTS_FILE: argumentsFile,
      BEEZ_RP_BIN,
    },
  });
  const npxArguments = existsSync(argumentsFile) ? readFileSync(argumentsFile, "utf8").trim().split(/\r?\n/u) : null;

  return { exitCode: result.status, output: result.stdout, npxArguments };
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("vercel ignore command", () => {
  it(
    "should run the beez-rp range declared in package.json and build the next stable version",
    () => {
      const { exitCode, output, npxArguments } = runIgnoreCommand(createRepositoryWithVersions(["0.1.0", "0.2.0"]), "real");

      expect(npxArguments).toEqual(["--yes", `beez-rp@${FIXTURE_BEEZ_RP_RANGE}`, "ignore-build"]);
      expect(output).toContain("0.1.0 -> 0.2.0. Building.");
      expect(exitCode).toBe(BUILD_EXIT_CODE);
    },
    GIT_FIXTURE_TEST_TIMEOUT_MS
  );

  it(
    "should skip commits that keep, lower, skip or prerelease the version",
    () => {
      for (const versions of [["0.2.0", "0.2.0"], ["0.2.0", "0.1.9"], ["1.0.0", "3.0.0"], ["0.2.0", "0.3.0-beta.1"]]) {
        expect(runIgnoreCommand(createRepositoryWithVersions(versions), "real").exitCode).toBe(SKIP_BUILD_EXIT_CODE);
      }
    },
    GIT_FIXTURE_TEST_TIMEOUT_MS
  );

  it(
    "should skip the build when npx fails, even after printing BUILD",
    () => {
      const repositoryRoot = createRepositoryWithVersions(["0.1.0", "0.2.0"]);

      expect(runIgnoreCommand(repositoryRoot, "network-failure").exitCode).toBe(SKIP_BUILD_EXIT_CODE);
      expect(runIgnoreCommand(repositoryRoot, "build-then-failure").exitCode).toBe(SKIP_BUILD_EXIT_CODE);
    },
    GIT_FIXTURE_TEST_TIMEOUT_MS
  );

  it(
    "should skip the build without calling npx when package.json does not declare beez-rp",
    () => {
      const { exitCode, npxArguments } = runIgnoreCommand(createRepositoryWithVersions(["0.1.0", "0.2.0"], false), "real");

      expect(exitCode).toBe(SKIP_BUILD_EXIT_CODE);
      expect(npxArguments).toBeNull();
    },
    GIT_FIXTURE_TEST_TIMEOUT_MS
  );
});
