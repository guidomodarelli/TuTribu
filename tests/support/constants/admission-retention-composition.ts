/** Names real migration assets and historical ages used only in owned retention fixtures. @module admission-retention-composition-test-constants */
export const ADMISSION_RETENTION_COMPOSITION_FIXTURE = {
  prefixDirectoryName: "tutribu-retention-prefix-",
  importRetentionMigrationTag: "20261012200000_minimize_expired_allowlist_import_material",
  credentialUsageMigrationTag: "20261006230000_bind_credential_validation_usage",
  migrationDirectory: "database/migrations",
  journalRelativePath: "meta/_journal.json",
  defaultConfigPath: "drizzle.config.ts",
  prefixConfigName: "retention-prefix.config.ts",
  drizzleCliPath: "node_modules/drizzle-kit/bin.cjs",
  securityEnvironment: "synthetic-retention-composition",
  expiredVerificationAgeMs: 660_000,
} as const;
