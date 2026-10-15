#!/usr/bin/env node
/**
 * Manages the developer's Neon sandbox branch: a named, long-lived branch of
 * the project's default branch that local development uses instead of the
 * shared database, so the IDs created while `MOCK_EXTERNAL_APIS=1` simulates
 * Mercado Pago never reach shared data.
 *
 * Usage:
 *   pnpm db:sandbox [-- --reset | --delete] [--dry-run]
 *   node scripts/dev-database-sandbox.mjs [--reset | --delete] [--dry-run]
 *
 * - No flag: creates the branch when missing (or reuses it), applies the
 *   pending migrations of `database/migrations/` to it, and writes its runtime
 *   (pooled) and maintenance (direct) connection strings to `.env.local`.
 * - `--reset`: resets the branch from its parent (a fresh copy of the default
 *   branch, discarding local data), then migrates and rewrites `.env.local`.
 * - `--delete`: deletes the branch and removes its block from `.env.local`, so
 *   the app falls back to the connection configured in `.env`.
 * - `--dry-run`: only reads; prints the plan without creating, migrating or
 *   writing anything.
 *
 * Credentials come from the environment (`NEON_API_KEY`, `NEON_PROJECT_ID`,
 * also read from `.env.local`). The script never prints a connection string or
 * the API key, and refuses to act on the default, primary or protected branch.
 *
 * @module dev-database-sandbox
 */

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import nextEnvironment from "@next/env";

import { callNeonApi, NeonApiError, readOperationIds, waitForNeonOperations } from "./neon/neon-api-client.mjs";

const SANDBOX_MODE = { delete: "delete", ensure: "ensure", reset: "reset" };
const SANDBOX_FLAG = { delete: "--delete", dryRun: "--dry-run", reset: "--reset" };
/** Separator that `pnpm db:sandbox -- <flags>` forwards literally. */
const ARGUMENT_SEPARATOR = "--";
const SANDBOX_BRANCH_PREFIX = "dev-sandbox-";
const PREFERRED_DATABASE_NAME = "neondb";
const NEON_ENDPOINT_TYPE = "read_write";
const ENVIRONMENT_FILE_NAME = ".env.local";
const MIGRATIONS_SCRIPT_PATH = "scripts/push-migrations.js";
const OPERATION_PREFIX = "dev-database-sandbox";
const EXIT_CODE = { failure: 1, success: 0 };
const REDACTED_VALUE = "***";
const UNPARSEABLE_CONNECTION_STRING = "<cadena de conexión no válida>";
const SANDBOX_ENVIRONMENT = {
  apiKey: "NEON_API_KEY",
  branchName: "NEON_DEV_BRANCH_NAME",
  projectId: "NEON_PROJECT_ID",
};
const DATABASE_ENVIRONMENT_KEY = {
  maintenance: "DATABASE_MAINTENANCE_URL",
  migration: "DATABASE_MIGRATION_URL",
  runtime: "DATABASE_URL",
};
const MANAGED_ENVIRONMENT_KEYS = Object.values(DATABASE_ENVIRONMENT_KEY);
const ENVIRONMENT_BLOCK_MARKER = {
  end: "# <<< dev-database-sandbox",
  start: "# >>> dev-database-sandbox: generado por `pnpm db:sandbox`; `pnpm db:sandbox -- --delete` lo quita.",
};
const SANDBOX_STEP = {
  createBranch: "createBranch",
  deleteBranch: "deleteBranch",
  migrate: "migrate",
  removeEnvironment: "removeEnvironment",
  resetBranch: "resetBranch",
  reuseBranch: "reuseBranch",
  writeEnvironment: "writeEnvironment",
};

const SCRIPT_MESSAGE = {
  dryRunHeader: "Modo --dry-run: solo se consulta Neon; no se crea, migra ni escribe nada.",
  dryRunWithoutCredentials: `Sin ${SANDBOX_ENVIRONMENT.apiKey} o ${SANDBOX_ENVIRONMENT.projectId}: el plan asume que la branch no existe.`,
  environmentRemoved: `Variables de base de datos del sandbox quitadas de ${ENVIRONMENT_FILE_NAME}; la app vuelve a usar .env.`,
  environmentWritten: (redactedRuntime, redactedDirect) =>
    `${ENVIRONMENT_FILE_NAME} actualizado: runtime ${redactedRuntime}, migraciones y mantenimiento ${redactedDirect}.`,
  migrationsFailed: "Las migraciones fallaron en el sandbox; .env.local no se modificó.",
  missingCredentials: `Definí ${SANDBOX_ENVIRONMENT.apiKey} y ${SANDBOX_ENVIRONMENT.projectId} (en el entorno o en ${ENVIRONMENT_FILE_NAME}).`,
  plan: (branchName, steps) => `Branch ${branchName}: ${steps.join(" -> ")}`,
  ready: "Sandbox listo. Reiniciá `pnpm run dev` si ya estaba corriendo para que tome la nueva base.",
  step: {
    createBranch: (branchName) => `Creando la branch ${branchName} desde la branch default.`,
    deleteBranch: (branchName) => `Eliminando la branch ${branchName}.`,
    migrate: "Aplicando las migraciones pendientes al sandbox.",
    resetBranch: (branchName) => `Reseteando ${branchName} desde su branch padre.`,
    reuseBranch: (branchName) => `Reutilizando la branch existente ${branchName}.`,
  },
};

/**
 * Parses the script flags.
 *
 * @param {string[]} scriptArguments - Arguments after the script path.
 * @returns {{ mode: "ensure" | "reset" | "delete", isDryRun: boolean }} Selected mode.
 * @throws {Error} When a flag is unknown or `--reset` and `--delete` are combined.
 */
export function parseSandboxArguments(scriptArguments) {
  const flags = scriptArguments.filter((scriptArgument) => scriptArgument !== ARGUMENT_SEPARATOR);
  const knownFlags = new Set(Object.values(SANDBOX_FLAG));
  const unknownFlags = flags.filter((flag) => !knownFlags.has(flag));

  if (unknownFlags.length > 0) {
    throw new Error(`${OPERATION_PREFIX}: flag desconocido ${unknownFlags.join(", ")}. Usá ${[...knownFlags].join(", ")}.`);
  }

  const wantsReset = flags.includes(SANDBOX_FLAG.reset);
  const wantsDelete = flags.includes(SANDBOX_FLAG.delete);

  if (wantsReset && wantsDelete) {
    throw new Error(`${OPERATION_PREFIX}: ${SANDBOX_FLAG.reset} y ${SANDBOX_FLAG.delete} no se pueden combinar.`);
  }

  let mode = SANDBOX_MODE.ensure;
  if (wantsReset) {
    mode = SANDBOX_MODE.reset;
  } else if (wantsDelete) {
    mode = SANDBOX_MODE.delete;
  }

  return { isDryRun: flags.includes(SANDBOX_FLAG.dryRun), mode };
}

/**
 * Resolves the stable sandbox branch name: the explicit override when set,
 * otherwise `dev-sandbox-<os-username>` so each developer gets one branch.
 *
 * @param {{ branchNameOverride?: string, username: string }} input
 * @returns {string} Branch name.
 * @throws {Error} When no usable name can be derived.
 */
export function resolveSandboxBranchName({ branchNameOverride, username }) {
  const trimmedOverride = branchNameOverride?.trim();

  if (trimmedOverride) {
    return trimmedOverride;
  }

  const usernameSlug = username
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!usernameSlug) {
    throw new Error(`${OPERATION_PREFIX}: no se pudo derivar el nombre de la branch del usuario; definí ${SANDBOX_ENVIRONMENT.branchName}.`);
  }

  return `${SANDBOX_BRANCH_PREFIX}${usernameSlug}`;
}

/**
 * Decides the steps for a mode given the branch found by name.
 *
 * @param {{ mode: "ensure" | "reset" | "delete", existingBranch: { id: string, name: string, default?: boolean, primary?: boolean, protected?: boolean } | undefined }} input
 * @returns {string[]} Ordered steps (values of `SANDBOX_STEP`).
 * @throws {Error} When the branch is the default, primary or protected branch.
 */
export function planSandboxSteps({ mode, existingBranch }) {
  if (existingBranch && (existingBranch.default || existingBranch.primary || existingBranch.protected)) {
    throw new Error(
      `${OPERATION_PREFIX}: la branch ${existingBranch.name} (${existingBranch.id}) es default, primary o protegida; el sandbox nunca la modifica. Elegí otro ${SANDBOX_ENVIRONMENT.branchName}.`
    );
  }

  if (mode === SANDBOX_MODE.delete) {
    return existingBranch
      ? [SANDBOX_STEP.deleteBranch, SANDBOX_STEP.removeEnvironment]
      : [SANDBOX_STEP.removeEnvironment];
  }

  let branchStep = SANDBOX_STEP.createBranch;
  if (existingBranch) {
    branchStep = mode === SANDBOX_MODE.reset ? SANDBOX_STEP.resetBranch : SANDBOX_STEP.reuseBranch;
  }

  return [branchStep, SANDBOX_STEP.migrate, SANDBOX_STEP.writeEnvironment];
}

/**
 * Picks the database the app connects to and the role that owns it.
 *
 * @param {{ name: string, owner_name: string }[]} databases - Databases of the branch.
 * @returns {{ databaseName: string, roleName: string }} Connection target.
 * @throws {Error} When the branch has no database.
 */
export function selectSandboxDatabase(databases) {
  const selectedDatabase =
    databases.find((database) => database.name === PREFERRED_DATABASE_NAME) ?? databases[0];

  if (!selectedDatabase) {
    throw new Error(`${OPERATION_PREFIX}: la branch no tiene ninguna database.`);
  }

  return { databaseName: selectedDatabase.name, roleName: selectedDatabase.owner_name };
}

/**
 * Detects the line ending an env file already uses.
 *
 * @param {string} environmentFileText - File contents.
 * @returns {"\r\n" | "\n"} Line ending.
 */
function detectLineEnding(environmentFileText) {
  return environmentFileText.includes("\r\n") ? "\r\n" : "\n";
}

/**
 * Removes the sandbox block and any other assignment of the managed database
 * variables, so the app falls back to `.env`.
 *
 * @param {string} environmentFileText - Current `.env.local` contents.
 * @returns {string} Contents without sandbox database variables.
 */
export function removeSandboxEnvironment(environmentFileText) {
  const lineEnding = detectLineEnding(environmentFileText);
  const keptLines = [];
  let isInsideBlock = false;

  for (const line of environmentFileText.split(/\r?\n/)) {
    if (line === ENVIRONMENT_BLOCK_MARKER.start) {
      isInsideBlock = true;
      continue;
    }
    if (line === ENVIRONMENT_BLOCK_MARKER.end) {
      isInsideBlock = false;
      continue;
    }

    const isManagedAssignment = MANAGED_ENVIRONMENT_KEYS.some((key) => line.startsWith(`${key}=`));

    if (!isInsideBlock && !isManagedAssignment) {
      keptLines.push(line);
    }
  }

  while (keptLines.length > 1 && keptLines.at(-1) === "" && keptLines.at(-2) === "") {
    keptLines.pop();
  }

  return keptLines.join(lineEnding);
}

/**
 * Replaces the sandbox database variables of `.env.local` with the given
 * connection strings, inside a marked block. Idempotent.
 *
 * @param {string} environmentFileText - Current `.env.local` contents.
 * @param {Record<string, string>} connectionStrings - Values keyed by managed variable.
 * @returns {string} Updated contents.
 */
export function upsertSandboxEnvironment(environmentFileText, connectionStrings) {
  const lineEnding = detectLineEnding(environmentFileText);
  const baseText = removeSandboxEnvironment(environmentFileText).replace(/(\r?\n)+$/, "");
  const blockLines = [
    ENVIRONMENT_BLOCK_MARKER.start,
    ...MANAGED_ENVIRONMENT_KEYS.map((key) => `${key}=${connectionStrings[key]}`),
    ENVIRONMENT_BLOCK_MARKER.end,
  ];
  const leadingText = baseText ? `${baseText}${lineEnding}${lineEnding}` : "";

  return `${leadingText}${blockLines.join(lineEnding)}${lineEnding}`;
}

/**
 * Describes a connection string without its password or query parameters.
 *
 * @param {string} connectionString - Postgres connection string.
 * @returns {string} Safe description for logs.
 */
export function redactConnectionString(connectionString) {
  try {
    const connectionUrl = new URL(connectionString);

    return `${connectionUrl.protocol}//${connectionUrl.username}:${REDACTED_VALUE}@${connectionUrl.host}${connectionUrl.pathname}`;
  } catch {
    // Parsing failed: the raw value may still hold a secret, so it is never echoed.
    return UNPARSEABLE_CONNECTION_STRING;
  }
}

/**
 * Finds the branch with exactly this name.
 *
 * @param {{ apiKey: string, projectId: string, branchName: string }} input
 * @returns {Promise<any | undefined>} Neon branch, if any.
 */
async function findBranchByName({ apiKey, projectId, branchName }) {
  const { branches } = await callNeonApi({
    apiKey,
    method: "GET",
    operation: `${OPERATION_PREFIX}:findBranchByName`,
    path: `/projects/${projectId}/branches?search=${encodeURIComponent(branchName)}`,
  });

  return branches.find((branch) => branch.name === branchName);
}

/**
 * Creates the sandbox branch from the default branch with a read-write compute.
 *
 * @param {{ apiKey: string, projectId: string, branchName: string }} input
 * @returns {Promise<string>} New branch id.
 */
async function createSandboxBranch({ apiKey, projectId, branchName }) {
  const operation = `${OPERATION_PREFIX}:createSandboxBranch`;
  const created = await callNeonApi({
    apiKey,
    body: { branch: { name: branchName }, endpoints: [{ type: NEON_ENDPOINT_TYPE }] },
    method: "POST",
    operation,
    path: `/projects/${projectId}/branches`,
  });

  if (!created.branch?.id) {
    throw new NeonApiError(operation, "response without branch id");
  }

  await waitForNeonOperations({ apiKey, operation, operationIds: readOperationIds(created), projectId });

  return created.branch.id;
}

/**
 * Makes sure an existing branch has a read-write compute to connect to.
 *
 * @param {{ apiKey: string, projectId: string, branchId: string }} input
 */
async function ensureReadWriteEndpoint({ apiKey, projectId, branchId }) {
  const operation = `${OPERATION_PREFIX}:ensureReadWriteEndpoint`;
  const { endpoints } = await callNeonApi({
    apiKey,
    method: "GET",
    operation,
    path: `/projects/${projectId}/branches/${branchId}/endpoints`,
  });

  if (endpoints.some((endpoint) => endpoint.type === NEON_ENDPOINT_TYPE)) {
    return;
  }

  const created = await callNeonApi({
    apiKey,
    body: { endpoint: { branch_id: branchId, type: NEON_ENDPOINT_TYPE } },
    method: "POST",
    operation,
    path: `/projects/${projectId}/endpoints`,
  });
  await waitForNeonOperations({ apiKey, operation, operationIds: readOperationIds(created), projectId });
}

/**
 * Resets the branch to the latest state of its parent.
 *
 * @param {{ apiKey: string, projectId: string, branch: { id: string, parent_id: string } }} input
 */
async function resetSandboxBranch({ apiKey, projectId, branch }) {
  const operation = `${OPERATION_PREFIX}:resetSandboxBranch`;

  if (!branch.parent_id) {
    throw new NeonApiError(operation, `branch ${branch.id} has no parent to reset from`);
  }

  const restored = await callNeonApi({
    apiKey,
    body: { source_branch_id: branch.parent_id },
    method: "POST",
    operation,
    path: `/projects/${projectId}/branches/${branch.id}/restore`,
  });
  await waitForNeonOperations({ apiKey, operation, operationIds: readOperationIds(restored), projectId });
}

/**
 * Deletes the sandbox branch.
 *
 * @param {{ apiKey: string, projectId: string, branchId: string }} input
 */
async function deleteSandboxBranch({ apiKey, projectId, branchId }) {
  const operation = `${OPERATION_PREFIX}:deleteSandboxBranch`;
  const deleted = await callNeonApi({
    apiKey,
    method: "DELETE",
    operation,
    path: `/projects/${projectId}/branches/${branchId}`,
  });
  await waitForNeonOperations({ apiKey, operation, operationIds: readOperationIds(deleted), projectId });
}

/**
 * Reads the pooled (runtime) and direct (migrations, maintenance) connection
 * strings of the sandbox.
 *
 * @param {{ apiKey: string, projectId: string, branchId: string }} input
 * @returns {Promise<{ runtime: string, direct: string }>} Connection strings.
 */
async function readSandboxConnectionStrings({ apiKey, projectId, branchId }) {
  const operation = `${OPERATION_PREFIX}:readSandboxConnectionStrings`;
  const { databases } = await callNeonApi({
    apiKey,
    method: "GET",
    operation,
    path: `/projects/${projectId}/branches/${branchId}/databases`,
  });
  const { databaseName, roleName } = selectSandboxDatabase(databases);

  /** @param {boolean} pooled */
  const readUri = async (pooled) => {
    const query = new URLSearchParams({
      branch_id: branchId,
      database_name: databaseName,
      pooled: String(pooled),
      role_name: roleName,
    });
    const { uri } = await callNeonApi({
      apiKey,
      method: "GET",
      operation,
      path: `/projects/${projectId}/connection_uri?${query}`,
    });

    if (!uri) {
      throw new NeonApiError(operation, `response without uri (pooled=${pooled})`);
    }

    return uri;
  };

  return { direct: await readUri(false), runtime: await readUri(true) };
}

/**
 * Applies pending migrations with every database variable pointing at the
 * sandbox, so the run can never reach the default branch.
 *
 * @param {{ runtime: string, direct: string }} connectionStrings
 * @returns {Promise<number>} Exit code of the migration runner.
 */
function migrateSandbox({ runtime, direct }) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [MIGRATIONS_SCRIPT_PATH], {
      env: {
        ...process.env,
        [DATABASE_ENVIRONMENT_KEY.maintenance]: direct,
        [DATABASE_ENVIRONMENT_KEY.migration]: direct,
        [DATABASE_ENVIRONMENT_KEY.runtime]: runtime,
      },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? EXIT_CODE.failure));
  });
}

/**
 * Reads `.env.local`, or an empty file when it does not exist.
 *
 * @param {string} environmentFilePath - Absolute path.
 * @returns {string} Contents.
 */
function readEnvironmentFile(environmentFilePath) {
  return existsSync(environmentFilePath) ? readFileSync(environmentFilePath, "utf8") : "";
}

/**
 * Runs the requested mode end to end.
 *
 * @param {string[]} scriptArguments - Arguments after the script path.
 * @returns {Promise<number>} Exit code.
 */
async function main(scriptArguments) {
  const projectDirectory = process.cwd();
  nextEnvironment.loadEnvConfig(projectDirectory, true);

  const { mode, isDryRun } = parseSandboxArguments(scriptArguments);
  const branchName = resolveSandboxBranchName({
    branchNameOverride: process.env[SANDBOX_ENVIRONMENT.branchName],
    username: os.userInfo().username,
  });
  const apiKey = process.env[SANDBOX_ENVIRONMENT.apiKey]?.trim();
  const projectId = process.env[SANDBOX_ENVIRONMENT.projectId]?.trim();
  const environmentFilePath = path.join(projectDirectory, ENVIRONMENT_FILE_NAME);
  const hasCredentials = Boolean(apiKey && projectId);

  if (isDryRun) {
    console.log(SCRIPT_MESSAGE.dryRunHeader);
    if (!hasCredentials) {
      console.log(SCRIPT_MESSAGE.dryRunWithoutCredentials);
    }
  } else if (!hasCredentials) {
    console.error(SCRIPT_MESSAGE.missingCredentials);
    return EXIT_CODE.failure;
  }

  const existingBranch = hasCredentials ? await findBranchByName({ apiKey, branchName, projectId }) : undefined;
  const steps = planSandboxSteps({ existingBranch, mode });
  console.log(SCRIPT_MESSAGE.plan(branchName, steps));

  if (isDryRun) {
    return EXIT_CODE.success;
  }

  let branchId = existingBranch?.id;
  /** @type {{ runtime: string, direct: string } | undefined} */
  let connectionStrings;

  for (const step of steps) {
    switch (step) {
      case SANDBOX_STEP.createBranch:
        console.log(SCRIPT_MESSAGE.step.createBranch(branchName));
        branchId = await createSandboxBranch({ apiKey, branchName, projectId });
        break;
      case SANDBOX_STEP.reuseBranch:
        console.log(SCRIPT_MESSAGE.step.reuseBranch(branchName));
        await ensureReadWriteEndpoint({ apiKey, branchId, projectId });
        break;
      case SANDBOX_STEP.resetBranch:
        console.log(SCRIPT_MESSAGE.step.resetBranch(branchName));
        await resetSandboxBranch({ apiKey, branch: existingBranch, projectId });
        await ensureReadWriteEndpoint({ apiKey, branchId, projectId });
        break;
      case SANDBOX_STEP.deleteBranch:
        console.log(SCRIPT_MESSAGE.step.deleteBranch(branchName));
        await deleteSandboxBranch({ apiKey, branchId, projectId });
        break;
      case SANDBOX_STEP.migrate: {
        console.log(SCRIPT_MESSAGE.step.migrate);
        connectionStrings = await readSandboxConnectionStrings({ apiKey, branchId, projectId });
        const migrationExitCode = await migrateSandbox(connectionStrings);

        if (migrationExitCode !== EXIT_CODE.success) {
          console.error(SCRIPT_MESSAGE.migrationsFailed);
          return migrationExitCode;
        }
        break;
      }
      case SANDBOX_STEP.writeEnvironment:
        writeFileSync(
          environmentFilePath,
          upsertSandboxEnvironment(readEnvironmentFile(environmentFilePath), {
            [DATABASE_ENVIRONMENT_KEY.maintenance]: connectionStrings.direct,
            [DATABASE_ENVIRONMENT_KEY.migration]: connectionStrings.direct,
            [DATABASE_ENVIRONMENT_KEY.runtime]: connectionStrings.runtime,
          })
        );
        console.log(
          SCRIPT_MESSAGE.environmentWritten(
            redactConnectionString(connectionStrings.runtime),
            redactConnectionString(connectionStrings.direct)
          )
        );
        console.log(SCRIPT_MESSAGE.ready);
        break;
      case SANDBOX_STEP.removeEnvironment:
        if (existsSync(environmentFilePath)) {
          writeFileSync(environmentFilePath, removeSandboxEnvironment(readEnvironmentFile(environmentFilePath)));
        }
        console.log(SCRIPT_MESSAGE.environmentRemoved);
        break;
      default:
        throw new Error(`${OPERATION_PREFIX}: paso desconocido ${step}`);
    }
  }

  return EXIT_CODE.success;
}

if ((process.argv[1] ?? "").endsWith("dev-database-sandbox.mjs")) {
  try {
    process.exitCode = await main(process.argv.slice(2));
  } catch (error) {
    // Errors carry operation, method, path and status only; never request bodies or connection strings.
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = EXIT_CODE.failure;
  }
}
