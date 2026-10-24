/** Identifies the original SQL artifacts around the historical evidence snapshot. @module admission-evidence-history-test-constants */
export const ADMISSION_EVIDENCE_HISTORY_FIXTURE = {
  evidenceGuardMigrationTag: "20261005091500_guard_admission_evidence_transitions",
  snapshotCutoffMigrationTag: "20261007040000_add_messaging_connection_name",
} as const;
