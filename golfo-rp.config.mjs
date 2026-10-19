/**
 * TuTribu configuration of `golfo-rp create-version` (`pnpm create-version`,
 * alias `pnpm cv`). The shared command diagnoses the repository, plans and
 * ships the release from `main`; this file only describes what is specific to
 * TuTribu: what each version type means for users,
 * the Postgres/Drizzle migrations adapter and the Vercel deploy line.
 *
 * It must not import `@golfo/rp` at runtime: every helper arrives through the
 * hook context, and the types are only referenced from JSDoc.
 *
 * @module golfo-rp-config
 */

import { checkPendingMigrations, readMigrationJournalAt } from "./scripts/release/pending-migrations.mjs";
import { MIGRATION_JOURNAL_REVISIONS, READ_ONLY_RELEASE_ENABLED_VALUE, READ_ONLY_RELEASE_ENVIRONMENT_VARIABLE } from "./scripts/release/constants/release-safety.mjs";
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
 *   Mirrors `HookContext` of `@golfo/rp/create-version`.
 */

/** Lint, typecheck (source and tests), tests and build shared with CI; a failure stops the release before the bump. */
const RELEASE_CHECKS_COMMAND = "pnpm run ci";

/** Runs `drizzle-kit migrate` (shared with `pnpm run db:migrate`) with the same Node binary as the release. */
const MIGRATION_COMMAND = `"${process.execPath}" scripts/push-migrations.js`;

/**
 * Checks which journal migrations the configured database still misses.
 *
 * @param {HookContext} context - Hook context from `golfo-rp create-version`.
 * @returns {Promise<MigrationCheck>} Migration state; `target` is the database host.
 */
async function checkMigrations({ repositoryRoot, git }) {
  const journalEntries = await readMigrationJournalAt(git, MIGRATION_JOURNAL_REVISIONS);
  return /** @type {MigrationCheck} */ (await checkPendingMigrations({ repositoryRoot, journalEntries }));
}

/**
 * Applies pending migrations only when the release permits database mutations.
 *
 * @param {HookContext} context - Hook context from `golfo-rp create-version`.
 * @returns {Promise<void>}
 * @throws Stops the release before command execution when database writes are forbidden.
 */
async function applyMigrations({ run, fail }) {
  if (process.env[READ_ONLY_RELEASE_ENVIRONMENT_VARIABLE] === READ_ONLY_RELEASE_ENABLED_VALUE) {
    fail("El release está configurado sin cambios de base de datos.", "Revisá las migraciones pendientes por separado; no se ejecutó SQL ni se desplegó producción.");
  }

  const exitCode = await run(MIGRATION_COMMAND);

  if (exitCode !== 0) {
    fail(`drizzle-kit migrate falló con código ${exitCode}.`, "Revisá el error de arriba; no se subió ninguna versión.");
  }
}

/** @type {import("@golfo/rp/create-version").CreateVersionConfig} */
const createVersionConfig = {
  projectName: "TuTribu",
  /** IANA time zone for the `## [X.Y.Z] - YYYY-MM-DD` date written when `[Unreleased]` is closed. */
  releaseTimeZone: "America/Argentina/Buenos_Aires",
  /** Drafts missing `[Unreleased]` entries with Claude Code, then Codex, before a local release stops for them. */
  changelogDraft: true,
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

/** GitHub Actions workflow used by create-version. */
export const ci = {"workflow":"release.yml","secrets":["DATABASE_MIGRATION_URL"],"variables":[],"deployment":"vercel"};
