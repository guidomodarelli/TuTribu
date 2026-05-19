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
const DATABASE_MIGRATION_URL_ENV = "DATABASE_MIGRATION_URL";
const DATABASE_URL_ENV = "DATABASE_URL";
const DEVELOPMENT_NODE_ENV = "development";
const FORCE_ENVIRONMENT_RELOAD = true;
const FORCE_PUSH_OVERRIDE_ENV = "ALLOW_UNSAFE_DRIZZLE_FORCE_PUSH";
const RLS_RUNTIME_ROLE_NAME = "tutribu_rls_app";
const UNSAFE_FORCE_PUSH_BLOCK_MESSAGE =
  "Refusing to run drizzle-kit push --force because RLS policies are managed by versioned SQL migrations. Run db:migrate, or set ALLOW_UNSAFE_DRIZZLE_FORCE_PUSH=true only for an intentional local schema reset.";

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
 * Detects whether the destructive Drizzle push mode should be blocked.
 *
 * @param {NodeJS.ProcessEnv} [environment] Environment variables.
 * @returns {boolean} Whether force push must be rejected.
 */
function shouldBlockForcePush(environment = process.env) {
  return environment[FORCE_PUSH_OVERRIDE_ENV] !== "true";
}

/**
 * Reads the database user used by the application runtime.
 *
 * @param {NodeJS.ProcessEnv} [environment] Environment variables.
 * @returns {string | undefined} Runtime database user, when DATABASE_URL is valid.
 */
function getDatabaseUrlRuntimeRoleName(environment = process.env) {
  const databaseUrl = environment[DATABASE_URL_ENV];

  if (!databaseUrl) {
    return undefined;
  }

  try {
    const parsedDatabaseUrl = new URL(databaseUrl);

    return parsedDatabaseUrl.username
      ? decodeURIComponent(parsedDatabaseUrl.username)
      : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Escapes a PostgreSQL identifier for SQL statements that cannot parameterize it.
 *
 * @param {string} identifier PostgreSQL identifier.
 * @returns {string} Quoted PostgreSQL identifier.
 */
function quotePostgresIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

/**
 * Builds the grant that lets the runtime database user assume the RLS role.
 *
 * @param {string | undefined} runtimeDatabaseUser Runtime database user.
 * @returns {string | undefined} Grant SQL, when a runtime user is available.
 */
function buildGrantRuntimeRoleSql(runtimeDatabaseUser) {
  if (!runtimeDatabaseUser) {
    return undefined;
  }

  return `GRANT ${RLS_RUNTIME_ROLE_NAME} TO ${quotePostgresIdentifier(runtimeDatabaseUser)}`;
}

/**
 * Detects whether Next.js should load the development environment file chain.
 *
 * @param {NodeJS.ProcessEnv} [environment] Environment variables.
 * @returns {boolean} Whether `.env.development*` files should be loaded.
 */
function shouldLoadDevelopmentEnvironmentFiles(environment = process.env) {
  return environment.NODE_ENV === DEVELOPMENT_NODE_ENV;
}

/**
 * Loads the same local environment files used by Drizzle config.
 *
 * @returns {Promise<void>} Resolves after environment files have been loaded.
 */
async function loadDatabaseEnvironmentFiles() {
  const nextEnvironment = await import("@next/env");
  const loadEnvConfig =
    nextEnvironment.loadEnvConfig ?? nextEnvironment.default?.loadEnvConfig;

  if (!loadEnvConfig) {
    throw new Error("Unable to load Next.js environment configuration helper.");
  }

  loadEnvConfig(
    process.cwd(),
    shouldLoadDevelopmentEnvironmentFiles(),
    undefined,
    FORCE_ENVIRONMENT_RELOAD
  );
}

/**
 * Grants the RLS role to the application runtime database user.
 *
 * @returns {Promise<number>} Process exit code.
 */
async function grantRuntimeRoleToRuntimeDatabaseUser() {
  await loadDatabaseEnvironmentFiles();

  const grantRuntimeRoleSql = buildGrantRuntimeRoleSql(
    getDatabaseUrlRuntimeRoleName()
  );
  const connectionString =
    process.env[DATABASE_MIGRATION_URL_ENV] ?? process.env[DATABASE_URL_ENV];

  if (!grantRuntimeRoleSql || !connectionString) {
    return 0;
  }

  const { Client } = await import("pg");
  const client = new Client({ connectionString });

  try {
    await client.connect();
    await client.query(grantRuntimeRoleSql);
    return 0;
  } catch (error) {
    console.error(
      `Failed to grant ${RLS_RUNTIME_ROLE_NAME} to the DATABASE_URL user.`
    );
    console.error(error instanceof Error ? error.message : String(error));
    return 1;
  } finally {
    await client.end();
  }
}

/**
 * Runs the selected Drizzle Kit migration command.
 *
 * @param {string[]} [scriptArguments] Arguments received by this script.
 * @returns {number} Process exit code.
 */
async function runPushMigrations(scriptArguments = process.argv.slice(2)) {
  const { spawnSync } = await import("node:child_process");
  const { shouldForcePush } = normalizeScriptArguments(scriptArguments);

  if (shouldForcePush && shouldBlockForcePush()) {
    console.error(UNSAFE_FORCE_PUSH_BLOCK_MESSAGE);
    return 1;
  }

  const { command, commandArguments } = buildDrizzleKitCommand(scriptArguments);
  const result = spawnSync(command, commandArguments, {
    stdio: "inherit",
  });

  if (result.error) {
    console.error(result.error.message);
    return 1;
  }

  if (result.status !== 0) {
    return result.status ?? 1;
  }

  if (shouldForcePush) {
    return 0;
  }

  return grantRuntimeRoleToRuntimeDatabaseUser();
}

if ((process.argv[1] ?? "").endsWith("push-migrations.js")) {
  runPushMigrations().then((exitCode) => {
    process.exitCode = exitCode;
  });
}

module.exports = {
  buildGrantRuntimeRoleSql,
  buildDrizzleKitCommand,
  buildDrizzleKitArguments,
  getDatabaseUrlRuntimeRoleName,
  loadDatabaseEnvironmentFiles,
  normalizeScriptArguments,
  runPushMigrations,
  shouldBlockForcePush,
  shouldLoadDevelopmentEnvironmentFiles,
};
