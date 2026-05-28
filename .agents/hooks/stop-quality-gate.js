#!/usr/bin/env node
/**
 * Runs the repository quality gate before Codex finishes a turn.
 *
 * @file Codex Stop hook for repository validation.
 */

/**
 * Lists package scripts that must pass before Codex can stop for product code.
 *
 * @type {string[]}
 */
const QUALITY_GATE_SCRIPTS = ["typecheck", "lint", "test"];

/**
 * Lists package scripts that must pass for test-only changes.
 *
 * @type {string[]}
 */
const TEST_ONLY_QUALITY_GATE_SCRIPTS = ["typecheck", "lint", "test"];

/**
 * Lists signals that should cancel any active validation child process.
 *
 * @type {string[]}
 */
const CANCELLATION_SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"];

/**
 * Exit code used when the hook is cancelled by a signal.
 *
 * @type {number}
 */
const CANCELLATION_EXIT_CODE = 130;

/**
 * Tracks the currently running validation child so cancellation can reach it.
 *
 * @type {import("node:child_process").ChildProcess | null}
 */
let activeValidationChild = null;

/**
 * Lists file extensions that can affect product code or validation behavior.
 *
 * @type {string[]}
 */
const CODE_RELEVANT_FILE_EXTENSIONS = [
  ".cjs",
  ".css",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".scss",
  ".sql",
  ".ts",
  ".tsx",
];

/**
 * Lists extensionless or data/config files that can affect validation behavior.
 *
 * @type {Set<string>}
 */
const CODE_RELEVANT_FILE_NAMES = new Set([
  ".eslintrc",
  ".prettierrc",
  "bun.lockb",
  "components.json",
  "eslint.config.mjs",
  "jest.config.mjs",
  "next.config.ts",
  "package-lock.json",
  "package.json",
  "playwright.config.ts",
  "pnpm-lock.yaml",
  "postcss.config.mjs",
  "tsconfig.json",
  "tsconfig.typecheck.json",
  "yarn.lock",
]);

/**
 * Lists exact repository paths that control validation behavior.
 *
 * @type {Set<string>}
 */
const CODE_RELEVANT_FILE_PATHS = new Set([
  ".claude/settings.json",
  ".codex/hooks.json",
]);

/**
 * Maps lockfile names to their owning package manager.
 *
 * @type {Array<{lockfile: string, packageManager: string}>}
 */
const LOCKFILE_TO_PACKAGE_MANAGER = [
  { lockfile: "pnpm-lock.yaml", packageManager: "pnpm" },
  { lockfile: "yarn.lock", packageManager: "yarn" },
  { lockfile: "bun.lockb", packageManager: "bun" },
  { lockfile: "package-lock.json", packageManager: "npm" },
];

/**
 * Fallback package manager when no signal is available.
 *
 * @type {string}
 */
const DEFAULT_PACKAGE_MANAGER = "npm";

/**
 * Detects the package manager for the current repository.
 *
 * Prefers the explicit `packageManager` field in `package.json`, then falls
 * back to lockfile detection, and finally defaults to npm.
 *
 * @param {typeof import("node:fs")} fileSystem - Node fs module.
 * @returns {string} Detected package manager binary name.
 */
function detectPackageManager(fileSystem) {
  try {
    const packageJson = JSON.parse(
      fileSystem.readFileSync("package.json", "utf8")
    );

    if (typeof packageJson.packageManager === "string") {
      const declaredName = packageJson.packageManager.split("@")[0]?.trim();

      if (declaredName) {
        return declaredName;
      }
    }
  } catch {
    // Ignore parse errors and fall through to lockfile detection.
  }

  for (const candidate of LOCKFILE_TO_PACKAGE_MANAGER) {
    if (fileSystem.existsSync(candidate.lockfile)) {
      return candidate.packageManager;
    }
  }

  return DEFAULT_PACKAGE_MANAGER;
}

/**
 * Resolves how to invoke a package manager in the current environment.
 *
 * Prefers the direct binary; falls back to `corepack <pm>` when the direct
 * call cannot be located (common with Volta/Corepack-managed Windows setups).
 *
 * @param {string} packageManager - Detected package manager binary name.
 * @param {typeof import("node:child_process").spawnSync} spawnSyncCommand - Process runner.
 * @returns {{ command: string, baseArgs: string[] } | null} Working invocation, or null.
 */
function resolvePackageManagerRunner(packageManager, spawnSyncCommand) {
  const candidates = [
    { command: packageManager, baseArgs: [] },
    { command: "corepack", baseArgs: [packageManager] },
  ];

  for (const candidate of candidates) {
    const probe = spawnSyncCommand(
      candidate.command,
      [...candidate.baseArgs, "--version"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        shell: process.platform === "win32",
      }
    );

    if (probe.status === 0) {
      return candidate;
    }
  }

  return null;
}

/**
 * Builds the quality gate commands for a resolved package manager invocation.
 *
 * @param {{ command: string, baseArgs: string[] }} runner - Resolved invocation.
 * @param {string[]} validationScripts - Package scripts to run.
 * @returns {Array<{name: string, command: string, args: string[]}>} Command list.
 */
function buildQualityGateCommands(runner, validationScripts = QUALITY_GATE_SCRIPTS) {
  return validationScripts.map((script) => ({
    name: script,
    command: runner.command,
    args: [...runner.baseArgs, "run", script],
  }));
}

/**
 * Limits captured command output included in the continuation prompt.
 *
 * @type {number}
 */
const MAX_OUTPUT_LENGTH = 6000;

/**
 * Parses changed file paths from `git status --porcelain` output.
 *
 * @param {string} gitStatusOutput - Raw git porcelain status output.
 * @returns {string[]} Changed file paths.
 */
function parseChangedFilePaths(gitStatusOutput) {
  return gitStatusOutput
    .split(/\r?\n/)
    .filter(Boolean)
    .flatMap((statusLine) => {
      const pathSegment = statusLine.slice(3).trim();

      if (!pathSegment) {
        return [];
      }

      return pathSegment.split(" -> ");
    });
}

/**
 * Checks whether a changed path can affect product code or validation behavior.
 *
 * @param {string} changedFilePath - Changed file path.
 * @returns {boolean} True when the path should trigger the quality gate.
 */
function isCodeRelevantFilePath(changedFilePath) {
  const normalizedFilePath = changedFilePath.replace(/\\/g, "/").toLowerCase();
  const fileName = normalizedFilePath.split("/").pop() ?? normalizedFilePath;

  return (
    CODE_RELEVANT_FILE_PATHS.has(normalizedFilePath) ||
    CODE_RELEVANT_FILE_NAMES.has(fileName) ||
    CODE_RELEVANT_FILE_EXTENSIONS.some((extension) =>
      normalizedFilePath.endsWith(extension)
    )
  );
}

/**
 * Checks whether a changed path belongs to a test artifact.
 *
 * @param {string} changedFilePath - Changed file path.
 * @returns {boolean} True when the path is test-only.
 */
function isTestFilePath(changedFilePath) {
  const normalizedFilePath = changedFilePath.replace(/\\/g, "/").toLowerCase();
  const fileName = normalizedFilePath.split("/").pop() ?? normalizedFilePath;

  return (
    normalizedFilePath.startsWith("tests/") ||
    normalizedFilePath.includes("/tests/") ||
    normalizedFilePath.includes("/__tests__/") ||
    /\.(test|spec)\.[cm]?[jt]sx?$/.test(fileName)
  );
}

/**
 * Selects package scripts required for the current changed files.
 *
 * @param {string[]} changedFilePaths - Changed file paths.
 * @returns {string[]} Package scripts to run.
 */
function getQualityGateScriptsForChangedFiles(changedFilePaths) {
  const relevantChangedFilePaths = changedFilePaths.filter(isCodeRelevantFilePath);

  if (relevantChangedFilePaths.length === 0) {
    return [];
  }

  if (relevantChangedFilePaths.every(isTestFilePath)) {
    return TEST_ONLY_QUALITY_GATE_SCRIPTS;
  }

  return QUALITY_GATE_SCRIPTS;
}

/**
 * Checks whether the quality gate should run for the changed files.
 *
 * @param {string[]} changedFilePaths - Changed file paths.
 * @returns {boolean} True when at least one path is code-relevant.
 */
function shouldRunQualityGateForChangedFiles(changedFilePaths) {
  return getQualityGateScriptsForChangedFiles(changedFilePaths).length > 0;
}

/**
 * Reads changed file paths from the current Git worktree.
 *
 * Returns null when Git cannot provide a reliable status so the caller can
 * choose the safer fallback.
 *
 * @param {typeof import("node:child_process").spawnSync} spawnSyncCommand - Process runner.
 * @returns {string[] | null} Changed file paths, or null when detection fails.
 */
function readChangedFilePaths(spawnSyncCommand) {
  const statusResult = spawnSyncCommand(
    "git",
    ["status", "--porcelain", "--untracked-files=all"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    }
  );

  if (statusResult.status !== 0) {
    return null;
  }

  return parseChangedFilePaths(statusResult.stdout ?? "");
}

/**
 * Reads and parses the Codex hook input from stdin.
 *
 * @returns {Promise<Record<string, unknown>>} Parsed hook input.
 */
function readHookInput() {
  return new Promise((resolve) => {
    let input = "";

    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      input += chunk;
    });
    process.stdin.on("end", () => {
      if (!input.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(input));
      } catch {
        resolve({});
      }
    });
  });
}

/**
 * Shortens command output while preserving its tail.
 *
 * @param {string} output - Command output to truncate.
 * @returns {string} Truncated output.
 */
function truncateOutput(output) {
  if (output.length <= MAX_OUTPUT_LENGTH) {
    return output;
  }

  return output.slice(output.length - MAX_OUTPUT_LENGTH);
}

/**
 * Kills the active validation child process tree, if any is running.
 *
 * On Windows the child runs through `cmd.exe`, so killing the tree requires
 * `taskkill /T /F` to reach grandchildren such as `next build` or `tsc`.
 *
 * @param {typeof import("node:child_process").spawnSync} spawnSyncCommand - Process runner.
 * @returns {void}
 */
function killActiveValidationChild(spawnSyncCommand) {
  const child = activeValidationChild;

  if (!child || child.exitCode !== null || child.signalCode !== null) {
    return;
  }

  const childProcessId = child.pid;

  if (!childProcessId) {
    return;
  }

  if (process.platform === "win32") {
    try {
      spawnSyncCommand(
        "taskkill",
        ["/pid", String(childProcessId), "/T", "/F"],
        { stdio: "ignore" }
      );
    } catch {
      // Best-effort cleanup; ignore failures so the hook can still exit.
    }
    return;
  }

  try {
    child.kill("SIGTERM");
  } catch {
    // Best-effort cleanup; ignore failures so the hook can still exit.
  }
}

/**
 * Installs handlers that propagate cancellation signals to the active child.
 *
 * @param {typeof import("node:child_process").spawnSync} spawnSyncCommand - Process runner.
 * @returns {void}
 */
function installCancellationHandlers(spawnSyncCommand) {
  let cancellationInProgress = false;

  for (const cancellationSignal of CANCELLATION_SIGNALS) {
    process.on(cancellationSignal, () => {
      if (cancellationInProgress) {
        return;
      }

      cancellationInProgress = true;

      process.stderr.write(
        `[codex-stop-quality-gate] Received ${cancellationSignal}; cancelling active validation child.\n`
      );

      killActiveValidationChild(spawnSyncCommand);
      process.exit(CANCELLATION_EXIT_CODE);
    });
  }
}

/**
 * Runs one quality gate command and captures its result.
 *
 * Uses asynchronous spawn so the hook can react to cancellation signals while
 * the child is running and propagate the cancellation to the child tree.
 *
 * @param {{name: string, command: string, args: string[]}} validationCommand - Command definition.
 * @param {typeof import("node:child_process").spawn} spawnCommand - Async process runner.
 * @returns {Promise<{name: string, status: number | null, output: string}>} Captured command result.
 */
function runValidationCommand(validationCommand, spawnCommand) {
  const printableCommand = [
    validationCommand.command,
    ...validationCommand.args,
  ].join(" ");

  process.stderr.write(`[codex-stop-quality-gate] Running ${printableCommand}\n`);

  return new Promise((resolve) => {
    const child = spawnCommand(
      validationCommand.command,
      validationCommand.args,
      {
        cwd: process.cwd(),
        shell: process.platform === "win32",
      }
    );

    activeValidationChild = child;

    let stdoutBuffer = "";
    let stderrBuffer = "";

    child.stdout?.on("data", (chunk) => {
      stdoutBuffer += chunk.toString();
    });

    child.stderr?.on("data", (chunk) => {
      stderrBuffer += chunk.toString();
    });

    const finalize = (status) => {
      if (activeValidationChild === child) {
        activeValidationChild = null;
      }

      const output = `${stdoutBuffer}${stderrBuffer}`.trim();

      process.stderr.write(
        `[codex-stop-quality-gate] ${validationCommand.name} exited with ${
          status ?? "no status"
        }\n`
      );

      if (output) {
        process.stderr.write(`${truncateOutput(output)}\n`);
      }

      resolve({
        name: validationCommand.name,
        status,
        output: truncateOutput(output),
      });
    };

    child.on("close", (status) => {
      finalize(status);
    });

    child.on("error", (error) => {
      stderrBuffer += `${error instanceof Error ? error.message : String(error)}\n`;
      finalize(null);
    });
  });
}

/**
 * Builds the continuation prompt Codex receives when validations fail.
 *
 * @param {Array<{name: string, status: number | null, output: string}>} failures - Failed command results.
 * @param {{ command: string, baseArgs: string[] }} runner - Resolved package manager invocation.
 * @param {string[]} validationScripts - Package scripts included in this gate.
 * @returns {string} Continuation prompt.
 */
function buildFailureReason(
  failures,
  runner,
  validationScripts = QUALITY_GATE_SCRIPTS
) {
  const failureSummary = failures
    .map((failure) => {
      const output = failure.output || "No output captured.";

      return `## ${failure.name} failed\nExit status: ${
        failure.status ?? "unknown"
      }\n\n${output}`;
    })
    .join("\n\n");

  const runnerPrefix = [runner.command, ...runner.baseArgs].join(" ");
  const commandList = validationScripts.map(
    (script) => `${runnerPrefix} run ${script}`
  ).join(", ");

  return [
    "The Codex Stop quality gate failed.",
    "Fix the reported errors, then rerun the relevant validation commands before finishing.",
    `Validation commands: ${commandList}.`,
    "",
    failureSummary,
  ].join("\n");
}

/**
 * Runs the Stop hook quality gate.
 *
 * @returns {Promise<void>} Resolves after writing the hook JSON response.
 */
async function main() {
  const hookInput = await readHookInput();
  const fileSystem = await import("node:fs");
  const { spawn, spawnSync } = await import("node:child_process");

  installCancellationHandlers(spawnSync);

  if (!fileSystem.existsSync("package.json")) {
    process.stderr.write(
      "[codex-stop-quality-gate] package.json not found; skipping quality gate.\n"
    );
    process.stdout.write(JSON.stringify({}));
    return;
  }

  const changedFilePaths = readChangedFilePaths(spawnSync);
  let validationScripts = QUALITY_GATE_SCRIPTS;

  if (changedFilePaths === null) {
    process.stderr.write(
      "[codex-stop-quality-gate] Could not inspect changed files; running quality gate.\n"
    );
  } else {
    validationScripts = getQualityGateScriptsForChangedFiles(changedFilePaths);
  }

  if (validationScripts.length === 0) {
    process.stderr.write(
      "[codex-stop-quality-gate] No code-relevant changes detected; skipping quality gate.\n"
    );
    process.stdout.write(JSON.stringify({}));
    return;
  }

  const packageManager = detectPackageManager(fileSystem);
  const runner = resolvePackageManagerRunner(packageManager, spawnSync);

  if (!runner) {
    const reason = [
      "The Codex Stop quality gate could not find a working package manager.",
      `Detected package manager: ${packageManager}.`,
      `Tried: ${packageManager} --version and corepack ${packageManager} --version (both failed).`,
      "Install the package manager (or enable corepack) and rerun the validation commands before finishing.",
    ].join("\n");

    process.stderr.write(`[codex-stop-quality-gate] ${reason}\n`);

    if (hookInput.stop_hook_active === true) {
      process.stdout.write(JSON.stringify({ continue: false }));
      return;
    }

    process.stdout.write(JSON.stringify({ decision: "block", reason }));
    return;
  }

  const runnerLabel = [runner.command, ...runner.baseArgs].join(" ");

  process.stderr.write(
    `[codex-stop-quality-gate] Using package manager: ${packageManager} (via "${runnerLabel}")\n`
  );

  const qualityGateCommands = buildQualityGateCommands(runner, validationScripts);
  const results = [];

  for (const validationCommand of qualityGateCommands) {
    results.push(await runValidationCommand(validationCommand, spawn));
  }

  const failures = results.filter((result) => result.status !== 0);

  if (failures.length === 0) {
    process.stdout.write(JSON.stringify({}));
    return;
  }

  if (hookInput.stop_hook_active === true) {
    process.stderr.write(
      "[codex-stop-quality-gate] Validation still failed after Stop continuation; allowing final response with failure details.\n"
    );
    process.stdout.write(JSON.stringify({ continue: false }));
    return;
  }

  process.stdout.write(
    JSON.stringify({
      decision: "block",
      reason: buildFailureReason(failures, runner, validationScripts),
    })
  );
}

if ((process.argv[1] ?? "").endsWith("stop-quality-gate.js")) {
  main().catch((error) => {
    process.stderr.write(
      `[codex-stop-quality-gate] Unexpected hook failure: ${
        error instanceof Error ? error.message : String(error)
      }\n`
    );
    process.stdout.write(
      JSON.stringify({
        decision: "block",
        reason:
          "The Codex Stop quality gate hook failed unexpectedly. Inspect .agents/hooks/stop-quality-gate.js and fix the hook before finishing.",
      })
    );
  });
}

module.exports = {
  buildFailureReason,
  buildQualityGateCommands,
  detectPackageManager,
  getQualityGateScriptsForChangedFiles,
  isCodeRelevantFilePath,
  isTestFilePath,
  parseChangedFilePaths,
  readChangedFilePaths,
  resolvePackageManagerRunner,
  runValidationCommand,
  shouldRunQualityGateForChangedFiles,
  truncateOutput,
};
