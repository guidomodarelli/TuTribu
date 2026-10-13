/** Owns irreversible minimization of expired temporary input while retaining original row results and effects. @module allowlist-import-material-retention-port */
/** Publishes only confirmed counts; no temporary contact, name or report crosses this boundary. */
export type AllowlistImportMaterialRetentionResult = { purgedRows: number; completedImports: number };
/** Keeps the scope, clock, authority and original transaction within the private backend owner. */
export interface AllowlistImportMaterialRetention {
  /** @param command - Total row ceiling for this call, not a per-file limit. @returns Counts only after confirmed commit; uncertain completion rejects. */
  purge(command: { limit: number }): Promise<AllowlistImportMaterialRetentionResult>;
}
