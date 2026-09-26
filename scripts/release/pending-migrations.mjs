/**
 * Detects versioned SQL migrations that the configured database has not
 * applied yet, using the same rule as `drizzle-kit migrate`: a journal entry
 * is pending when its `when` timestamp is newer than the latest `created_at`
 * stored in `drizzle.__drizzle_migrations`.
 *
 * The connection string is resolved exactly like `drizzle.config.ts`
 * (`DATABASE_MIGRATION_URL`, then `DATABASE_URL`, loaded through
 * `@next/env`), so the check always targets the database that
 * `pnpm run db:migrate` would change. Only the host is ever shown.
 *
 * `beez-rp.config.mjs` uses it as the `migrations.check` adapter of
 * `beez-rp create-version`, so every result follows the `MigrationCheck`
 * contract of beez-rp (`status`, `pending`, `target`, `reason`).
 *
 * @module pending-migrations
 */

/** Result of checking the database, as `beez-rp create-version` expects it. */
export const MIGRATION_STATUS = Object.freeze({
  upToDate: "up-to-date",
  pending: "pending",
  unknown: "unknown",
});

/** Drizzle journal that lists every versioned migration. */
export const MIGRATION_JOURNAL_PATH = "database/migrations/meta/_journal.json";

/** Environment variables read by `drizzle.config.ts`, in priority order. */
const CONNECTION_STRING_ENVIRONMENT_VARIABLES = ["DATABASE_MIGRATION_URL", "DATABASE_URL"];

/** Latest migration applied by Drizzle Kit (default migrations table). */
const LAST_APPLIED_MIGRATION_QUERY =
  "select created_at from drizzle.__drizzle_migrations order by created_at desc limit 1";

/** PostgreSQL error code for a missing relation (no migration ever applied). */
const UNDEFINED_TABLE_ERROR_CODE = "42P01";

/** Keeps the release diagnosis responsive when the database is unreachable. */
const DATABASE_CONNECTION_TIMEOUT_MS = 10_000;

/**
 * Parses the Drizzle journal JSON into its migration entries.
 *
 * @param {string} journalText - Contents of `_journal.json`.
 * @returns {{ tag: string, when: number }[]} Entries ordered by `when`.
 */
export function parseMigrationJournal(journalText) {
  const journal = JSON.parse(journalText);

  return (journal.entries ?? [])
    .map((entry) => ({ tag: entry.tag, when: Number(entry.when) }))
    .sort((left, right) => left.when - right.when);
}

/**
 * Merges several journals (for example `origin/main` and the feature branch)
 * so migrations that are about to land are also considered.
 *
 * @param {{ tag: string, when: number }[][]} journals - Parsed journals.
 * @returns {{ tag: string, when: number }[]} Unique entries ordered by `when`.
 */
export function mergeMigrationJournals(journals) {
  const entriesByTag = new Map();

  for (const entry of journals.flat()) {
    entriesByTag.set(entry.tag, entry);
  }

  return [...entriesByTag.values()].sort((left, right) => left.when - right.when);
}

/**
 * Lists journal entries newer than the last migration applied by Drizzle.
 *
 * @param {{ tag: string, when: number }[]} journalEntries - Journal entries.
 * @param {number | null} lastAppliedCreatedAt - Latest `created_at`, or `null` when nothing was applied.
 * @returns {string[]} Tags of the pending migrations.
 */
export function findPendingMigrations(journalEntries, lastAppliedCreatedAt) {
  return journalEntries
    .filter((entry) => lastAppliedCreatedAt === null || entry.when > lastAppliedCreatedAt)
    .map((entry) => entry.tag);
}

/**
 * Reads the Drizzle journal at several Git revisions and merges them, so the
 * check also covers migrations of the checked-out branch that are about to
 * land on `origin/main`. A revision without a journal is skipped.
 *
 * @param {{ tryGit: (gitArguments: string[]) => Promise<string | null> }} gitReader - Git reader that returns `null` on failure.
 * @param {string[]} revisions - Revisions to read, for example `["HEAD", "origin/main"]`.
 * @returns {Promise<{ tag: string, when: number }[]>} Unique entries ordered by `when`.
 */
export async function readMigrationJournalAt(gitReader, revisions) {
  const journals = [];

  for (const revision of revisions) {
    const journalText = await gitReader.tryGit(["show", `${revision}:${MIGRATION_JOURNAL_PATH}`]);

    if (journalText) {
      journals.push(parseMigrationJournal(journalText));
    }
  }

  return mergeMigrationJournals(journals);
}

/**
 * Resolves the migration connection string the same way `drizzle.config.ts` does.
 *
 * @param {string} repositoryRoot - Repository root with the `.env*` files.
 * @returns {Promise<string | null>} Connection string, or `null` when not configured.
 */
export async function resolveMigrationConnectionString(repositoryRoot) {
  const nextEnvironment = await import("@next/env");
  // @next/env is CommonJS: its named export may only exist on the default export.
  const loadEnvConfig = nextEnvironment.loadEnvConfig ?? nextEnvironment.default.loadEnvConfig;
  const silentLogger = { info() {}, error() {} };
  loadEnvConfig(repositoryRoot, true, silentLogger, true);

  for (const variableName of CONNECTION_STRING_ENVIRONMENT_VARIABLES) {
    const value = process.env[variableName]?.trim();

    if (value) {
      return value;
    }
  }

  return null;
}

/**
 * Extracts the host of a connection string without credentials.
 *
 * @param {string} connectionString - PostgreSQL connection string.
 * @returns {string} Host name, or a placeholder when it cannot be parsed.
 */
export function describeDatabaseHost(connectionString) {
  try {
    return new URL(connectionString).hostname || "host desconocido";
  } catch {
    return "host desconocido";
  }
}

/**
 * Reads the latest `created_at` recorded by Drizzle Kit.
 *
 * @param {string} connectionString - PostgreSQL connection string.
 * @returns {Promise<number | null>} Timestamp in ms, or `null` when no migration was applied.
 */
async function queryLastAppliedMigration(connectionString) {
  const { default: pg } = await import("pg");
  const client = new pg.Client({
    connectionString,
    connectionTimeoutMillis: DATABASE_CONNECTION_TIMEOUT_MS,
  });

  await client.connect();

  try {
    const result = await client.query(LAST_APPLIED_MIGRATION_QUERY);
    const createdAt = result.rows[0]?.created_at;

    return createdAt === undefined || createdAt === null ? null : Number(createdAt);
  } catch (error) {
    if (error?.code === UNDEFINED_TABLE_ERROR_CODE) {
      return null;
    }

    throw error;
  } finally {
    await client.end();
  }
}

/**
 * Checks which migrations of the given journal are missing in the database.
 * Never throws: an unreachable or unconfigured database is reported as
 * {@link MIGRATION_STATUS.unknown} so the release can still continue.
 *
 * @param {{ repositoryRoot: string, journalEntries: { tag: string, when: number }[] }} options - Inputs.
 * @returns {Promise<{ status: string, pending: string[], target: string | null, reason: string | null }>} Result; `target` is the database host.
 */
export async function checkPendingMigrations({ repositoryRoot, journalEntries }) {
  let connectionString;

  try {
    connectionString = await resolveMigrationConnectionString(repositoryRoot);
  } catch (error) {
    return {
      status: MIGRATION_STATUS.unknown,
      pending: [],
      target: null,
      reason: `no se pudieron cargar los .env (${error?.message ?? "error desconocido"})`,
    };
  }

  if (!connectionString) {
    return {
      status: MIGRATION_STATUS.unknown,
      pending: [],
      target: null,
      reason: "no hay DATABASE_MIGRATION_URL ni DATABASE_URL en los .env",
    };
  }

  const databaseHost = describeDatabaseHost(connectionString);

  try {
    const lastAppliedCreatedAt = await queryLastAppliedMigration(connectionString);
    const pending = findPendingMigrations(journalEntries, lastAppliedCreatedAt);

    return {
      status: pending.length > 0 ? MIGRATION_STATUS.pending : MIGRATION_STATUS.upToDate,
      pending,
      target: databaseHost,
      reason: null,
    };
  } catch (error) {
    return {
      status: MIGRATION_STATUS.unknown,
      pending: [],
      target: databaseHost,
      reason: `falló la consulta a ${databaseHost} (${error?.code ?? error?.message ?? "error desconocido"})`,
    };
  }
}
