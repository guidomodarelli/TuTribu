#!/usr/bin/env node

const DRIZZLE_CONFIG_PATH = "drizzle.config.ts";
const FORCE_FLAG = "--force";
const PACKAGE_RUNNER_COMMAND = process.platform === "win32" ? "npx.cmd" : "npx";

/**
 * Splits script-owned flags from arguments passed through to Drizzle Kit.
 *
 * @param {string[]} [scriptArguments] Arguments received by this script.
 * @returns {{ passthroughArguments: string[], shouldForcePush: boolean }} Normalized execution options.
 */
function normalizeScriptArguments(scriptArguments = process.argv.slice(2)) {
  const passthroughArguments = [];
  let shouldForcePush = false;

  for (const scriptArgument of scriptArguments) {
    if (scriptArgument === FORCE_FLAG) {
      shouldForcePush = true;
      continue;
    }

    passthroughArguments.push(scriptArgument);
  }

  return {
    passthroughArguments,
    shouldForcePush,
  };
}

/**
 * Builds the Drizzle Kit command arguments for migration execution.
 *
 * @param {string[]} [scriptArguments] Arguments received by this script.
 * @returns {string[]} Arguments passed to the package runner.
 */
function buildDrizzleKitArguments(scriptArguments = process.argv.slice(2)) {
  const { passthroughArguments, shouldForcePush } =
    normalizeScriptArguments(scriptArguments);

  if (shouldForcePush) {
    return [
      "drizzle-kit",
      "push",
      "--config",
      DRIZZLE_CONFIG_PATH,
      FORCE_FLAG,
      ...passthroughArguments,
    ];
  }

  return [
    "drizzle-kit",
    "migrate",
    "--config",
    DRIZZLE_CONFIG_PATH,
    ...passthroughArguments,
  ];
}

/**
 * Runs the selected Drizzle Kit migration command.
 *
 * @param {string[]} [scriptArguments] Arguments received by this script.
 * @returns {number} Process exit code.
 */
async function runPushMigrations(scriptArguments = process.argv.slice(2)) {
  const { spawnSync } = await import("node:child_process");
  const drizzleKitArguments = buildDrizzleKitArguments(scriptArguments);
  const result = spawnSync(PACKAGE_RUNNER_COMMAND, drizzleKitArguments, {
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  return result.status ?? 1;
}

if ((process.argv[1] ?? "").endsWith("push-migrations.js")) {
  runPushMigrations().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = {
  buildDrizzleKitArguments,
  normalizeScriptArguments,
  runPushMigrations,
};
