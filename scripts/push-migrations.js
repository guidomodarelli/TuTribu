#!/usr/bin/env node
/**
 * Provides the local Drizzle Kit migration runner used by npm scripts.
 *
 * @module push-migrations
 */

/**
 * Stores the Drizzle Kit configuration file used by migration commands.
 */
const DRIZZLE_CONFIG_PATH = "drizzle.config.ts";

/**
 * Stores the script-owned flag that selects Drizzle Kit push mode.
 */
const FORCE_FLAG = "--force";

/**
 * Stores the local Drizzle Kit CLI entrypoint resolved from the workspace.
 */
const DRIZZLE_KIT_CLI_PATH = "node_modules/drizzle-kit/bin.cjs";

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
 * Builds the executable command for the local Drizzle Kit CLI.
 *
 * @param {string[]} [scriptArguments] Arguments received by this script.
 * @returns {{ command: string, commandArguments: string[] }} Command and arguments passed to child_process.
 */
function buildDrizzleKitCommand(scriptArguments = process.argv.slice(2)) {
  const [, ...drizzleKitArguments] = buildDrizzleKitArguments(scriptArguments);

  return {
    command: process.execPath,
    commandArguments: [DRIZZLE_KIT_CLI_PATH, ...drizzleKitArguments],
  };
}

/**
 * Runs the selected Drizzle Kit migration command.
 *
 * @param {string[]} [scriptArguments] Arguments received by this script.
 * @returns {number} Process exit code.
 */
async function runPushMigrations(scriptArguments = process.argv.slice(2)) {
  const { spawnSync } = await import("node:child_process");
  const { command, commandArguments } = buildDrizzleKitCommand(scriptArguments);
  const result = spawnSync(command, commandArguments, {
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
  buildDrizzleKitCommand,
  buildDrizzleKitArguments,
  normalizeScriptArguments,
  runPushMigrations,
};
