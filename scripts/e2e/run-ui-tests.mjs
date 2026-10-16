#!/usr/bin/env node
/**
 * Runs the Playwright UI suite (`playwright.ui.config.ts`) against the
 * production build, preparing a disposable database for the signed-in
 * scenarios first.
 *
 * With `NEON_API_KEY` and `NEON_PROJECT_ID` set, it creates a Neon branch of
 * the default branch, applies the pending migrations, seeds a member, a tribe
 * and its content, signs a session with a per-run `BETTER_AUTH_SECRET`, runs
 * Playwright with `next start` pointed at that branch and deletes the branch at
 * the end, even when the tests fail. `E2E_DATABASE_URL` points the run at an
 * existing disposable database instead (it is seeded but not deleted). Without
 * either, the signed-in specs skip and the public ones still run. These
 * variables may live in `.env.local`, loaded the same way `next start` does.
 *
 * Usage:
 *   pnpm test:ui [-- <playwright arguments>]
 *   node scripts/e2e/run-ui-tests.mjs [<playwright arguments>]
 *
 * @module run-ui-tests
 */

import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";

import nextEnvironment from "@next/env";

import { seedDialogFixtures } from "./dialog-fixtures.mjs";
import { createNeonTestBranch, deleteNeonTestBranch } from "./neon-test-branch.mjs";
import { UI_TEST_ORIGIN, UI_TEST_SESSION_ENV } from "./ui-test-environment.mjs";

const PLAYWRIGHT_CLI_PATH = "node_modules/@playwright/test/cli.js";
const PLAYWRIGHT_UI_CONFIG_PATH = "playwright.ui.config.ts";
const MIGRATIONS_SCRIPT_PATH = "scripts/push-migrations.js";
const AUTH_SECRET_BYTES = 32;
const INVITATION_KEY_BYTES = 32;
const RUN_ID_BYTES = 4;
const RUN_ID_ENCODING = "hex";
const SECRET_ENCODING = "base64";
const EXIT_CODE = { failure: 1 };
/** Separator that `pnpm test:ui -- <args>` forwards literally; Playwright would read it as a file filter. */
const ARGUMENT_SEPARATOR = "--";
/** Placeholder OAuth client: Better Auth requires one at boot, the tests never reach Google. */
const PLACEHOLDER_GOOGLE_CLIENT = { id: "e2e-google-client-id", secret: "e2e-google-client-secret" };

const RUNNER_MESSAGE = {
  branchCreated: "Rama efímera de Neon creada para la corrida.",
  branchDeleted: "Rama efímera de Neon eliminada.",
  branchDeleteFailed: (branchId) =>
    `No se pudo eliminar la rama efímera ${branchId}; borrala a mano desde la consola de Neon.`,
  migrationsFailed: "Las migraciones fallaron en la base efímera.",
  noDatabase:
    "Sin NEON_API_KEY + NEON_PROJECT_ID ni E2E_DATABASE_URL: los escenarios con sesión (diálogos) se omiten.",
  seeded: "Datos de prueba sembrados (líder, integrante, tribu, mensajes con comentarios y me gustas, y evento).",
};

/**
 * Runs a Node CLI with inherited stdio and resolves with its exit code.
 *
 * @param {string[]} commandArguments - Arguments after the Node binary.
 * @param {NodeJS.ProcessEnv} environment - Child environment.
 * @returns {Promise<number>} Exit code.
 */
function runNodeCommand(commandArguments, environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, commandArguments, { env: environment, stdio: "inherit" });
    child.on("error", reject);
    child.on("exit", (code) => resolve(code ?? EXIT_CODE.failure));
  });
}

/**
 * Runs the UI suite with the given Playwright arguments and environment.
 *
 * @param {string[]} playwrightArguments - Extra Playwright arguments.
 * @param {NodeJS.ProcessEnv} environment - Environment for Playwright and `next start`.
 * @returns {Promise<number>} Playwright exit code.
 */
function runPlaywright(playwrightArguments, environment) {
  return runNodeCommand([PLAYWRIGHT_CLI_PATH, "test", "--config", PLAYWRIGHT_UI_CONFIG_PATH, ...playwrightArguments], environment);
}

/**
 * Builds the server and test environment for a seeded database. Every
 * database URL points at the disposable branch so the run can never reach the
 * developer's database.
 *
 * @param {{ connectionString: string, authSecret: string, fixtures: Awaited<ReturnType<typeof seedDialogFixtures>> }} input
 * @returns {NodeJS.ProcessEnv} Child environment.
 */
function buildSeededEnvironment({ connectionString, authSecret, fixtures }) {
  return {
    ...process.env,
    BETTER_AUTH_SECRET: authSecret,
    BETTER_AUTH_URL: UI_TEST_ORIGIN,
    DATABASE_MAINTENANCE_URL: connectionString,
    DATABASE_MIGRATION_URL: connectionString,
    DATABASE_URL: connectionString,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || PLACEHOLDER_GOOGLE_CLIENT.id,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || PLACEHOLDER_GOOGLE_CLIENT.secret,
    TRIBE_INVITATION_TOKEN_ENCRYPTION_KEY:
      process.env.TRIBE_INVITATION_TOKEN_ENCRYPTION_KEY ||
      randomBytes(INVITATION_KEY_BYTES).toString(SECRET_ENCODING),
    [UI_TEST_SESSION_ENV.discussedMessageTitle]: fixtures.discussedMessageTitle,
    [UI_TEST_SESSION_ENV.eventTitle]: fixtures.eventTitle,
    [UI_TEST_SESSION_ENV.likedMessageTitle]: fixtures.likedMessageTitle,
    [UI_TEST_SESSION_ENV.messageTitle]: fixtures.messageTitle,
    [UI_TEST_SESSION_ENV.sessionCookie]: fixtures.sessionCookie,
    [UI_TEST_SESSION_ENV.tribemateSessionCookie]: fixtures.tribemateSessionCookie,
    [UI_TEST_SESSION_ENV.tribeSlug]: fixtures.tribeSlug,
  };
}

/**
 * Migrates and seeds the database, then runs Playwright against it.
 *
 * @param {string} connectionString - Owner connection string of the disposable database.
 * @param {string[]} playwrightArguments - Extra Playwright arguments.
 * @returns {Promise<number>} Playwright exit code.
 */
async function runSeededSuite(connectionString, playwrightArguments) {
  const migrationEnvironment = { ...process.env, DATABASE_MIGRATION_URL: connectionString, DATABASE_URL: connectionString };
  const migrationExitCode = await runNodeCommand([MIGRATIONS_SCRIPT_PATH], migrationEnvironment);

  if (migrationExitCode !== 0) {
    console.error(RUNNER_MESSAGE.migrationsFailed);
    return migrationExitCode;
  }

  const authSecret = randomBytes(AUTH_SECRET_BYTES).toString(SECRET_ENCODING);
  const runId = randomBytes(RUN_ID_BYTES).toString(RUN_ID_ENCODING);
  const fixtures = await seedDialogFixtures({ authSecret, connectionString, runId });
  console.log(RUNNER_MESSAGE.seeded);

  return runPlaywright(playwrightArguments, buildSeededEnvironment({ authSecret, connectionString, fixtures }));
}

/**
 * Entry point: picks the database source, runs the suite and cleans up.
 *
 * @param {string[]} playwrightArguments - Extra Playwright arguments.
 * @returns {Promise<number>} Exit code.
 */
async function runUiTests(playwrightArguments) {
  const { E2E_DATABASE_URL: providedDatabaseUrl, NEON_API_KEY: apiKey, NEON_PROJECT_ID: projectId } = process.env;

  if (providedDatabaseUrl) {
    return runSeededSuite(providedDatabaseUrl, playwrightArguments);
  }

  if (!apiKey || !projectId) {
    console.warn(RUNNER_MESSAGE.noDatabase);
    return runPlaywright(playwrightArguments, process.env);
  }

  const branchName = `e2e-ui-${randomBytes(RUN_ID_BYTES).toString(RUN_ID_ENCODING)}`;
  const { branchId, connectionString } = await createNeonTestBranch({ apiKey, branchName, projectId });
  console.log(RUNNER_MESSAGE.branchCreated);
  // Ctrl+C reaches Playwright too; keep this process alive so the branch is deleted.
  const ignoreInterrupt = () => {};
  process.on("SIGINT", ignoreInterrupt);

  try {
    return await runSeededSuite(connectionString, playwrightArguments);
  } finally {
    try {
      await deleteNeonTestBranch({ apiKey, branchId, projectId });
      console.log(RUNNER_MESSAGE.branchDeleted);
    } catch (error) {
      console.error(RUNNER_MESSAGE.branchDeleteFailed(branchId), error);
    }
    process.off("SIGINT", ignoreInterrupt);
  }
}

nextEnvironment.loadEnvConfig(process.cwd());
runUiTests(process.argv.slice(2).filter((argument) => argument !== ARGUMENT_SEPARATOR)).then(
  (exitCode) => {
    process.exitCode = exitCode;
  },
  (error) => {
    console.error("run-ui-tests failed", error);
    process.exitCode = EXIT_CODE.failure;
  }
);
