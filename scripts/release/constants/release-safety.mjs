/**
 * Defines the release database safety contract shared by the configuration and CI preflight.
 * @module release-safety
 */

/** Git revisions whose migration journals participate in the release diagnosis. */
export const MIGRATION_JOURNAL_REVISIONS = ["HEAD", "origin/main"];

/** Environment switch that forbids the release adapter from executing database mutations. */
export const READ_ONLY_RELEASE_ENVIRONMENT_VARIABLE = "TUTRIBU_RELEASE_READ_ONLY";

/** Enabled value of the database read-only release switch. */
export const READ_ONLY_RELEASE_ENABLED_VALUE = "1";
