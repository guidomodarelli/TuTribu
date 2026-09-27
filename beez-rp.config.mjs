/**
 * TuTribu configuration of `beez-rp create-version` (`pnpm create-version`,
 * alias `pnpm cv`). The shared command diagnoses the repository, plans and
 * ships the release from `main`; this file only describes what is specific to
 * TuTribu: who reads the CHANGELOG, what each version type means for users,
 * the Postgres/Drizzle migrations adapter and the Vercel deploy line.
 *
 * It must not import `beez-rp` at runtime: every helper arrives through the
 * hook context, and the types are only referenced from JSDoc.
 *
 * @module beez-rp-config
 */

import { checkPendingMigrations, readMigrationJournalAt } from "./scripts/release/pending-migrations.mjs";

/**
 * @typedef {{ status: "up-to-date" | "pending" | "unknown", pending: string[], target: string | null, reason: string | null }} MigrationCheck
 * @typedef {{
 *   repositoryRoot: string,
 *   version: string | null,
 *   git: { git: (gitArguments: string[]) => Promise<string>, tryGit: (gitArguments: string[]) => Promise<string | null> },
 *   run: (commandLine: string) => Promise<number>,
 *   print: (text?: string) => void,
 *   fail: (message: string, hint: string) => never,
 * }} HookContext
 *   Mirrors `HookContext` of `beez-rp/create-version` (beez-rp >= 0.2.0).
 */

/**
 * Revisions whose Drizzle journals are merged: the checked-out branch and the
 * migrations that are about to land on `origin/main`.
 */
const MIGRATION_JOURNAL_REVISIONS = ["HEAD", "origin/main"];

/** Lint, typecheck (source and tests), tests and build shared with CI; a failure stops the release before the bump. */
const RELEASE_CHECKS_COMMAND = "pnpm run ci";

/** Runs `drizzle-kit migrate` (shared with `pnpm run db:migrate`) with the same Node binary as the release. */
const MIGRATION_COMMAND = `"${process.execPath}" scripts/push-migrations.js`;

/**
 * Checks which journal migrations the configured database still misses.
 *
 * @param {HookContext} context - Hook context from `beez-rp create-version`.
 * @returns {Promise<MigrationCheck>} Migration state; `target` is the database host.
 */
async function checkMigrations({ repositoryRoot, git }) {
  const journalEntries = await readMigrationJournalAt(git, MIGRATION_JOURNAL_REVISIONS);
  return /** @type {MigrationCheck} */ (await checkPendingMigrations({ repositoryRoot, journalEntries }));
}

/**
 * Applies the pending migrations with `drizzle-kit migrate`.
 *
 * @param {HookContext} context - Hook context from `beez-rp create-version`.
 * @returns {Promise<void>}
 */
async function applyMigrations({ run, fail }) {
  const exitCode = await run(MIGRATION_COMMAND);

  if (exitCode !== 0) {
    fail(`drizzle-kit migrate falló con código ${exitCode}.`, "Revisá el error de arriba; no se subió ninguna versión.");
  }
}

/** @type {import("beez-rp/create-version").CreateVersionConfig} */
const createVersionConfig = {
  projectName: "TuTribu",
  changelog: { audience: "quien usa TuTribu (miembros y creadores de tribus)", language: "es" },
  releaseTypeDescriptions: {
    patch: "Solo arreglos o cambios internos; nada nuevo para quien usa la app.",
    minor: "Funcionalidades o mejoras nuevas; lo existente sigue funcionando igual.",
    major: "Cambio grande o incompatible: flujos, datos o comportamiento que cambian para los usuarios.",
  },
  publishedLabel: "en producción",
  checks: [RELEASE_CHECKS_COMMAND],
  migrations: {
    check: checkMigrations,
    apply: applyMigrations,
    targetHint: "DATABASE_MIGRATION_URL del .env",
  },
  summary: ["Deploy: Vercel detecta el cambio de versión y buildea producción."],
};

export default createVersionConfig;
