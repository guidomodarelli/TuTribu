/** Defines private terminal-data minimization independently of database, keys and provider delivery. @module admission-private-data-retention */

/** Uses separate bounded units for request/decision pairs and individual audit rows. */
export type AdmissionPrivateDataRetentionCommand = { requestLimit: number; auditLimit: number };
/** Reports only confirmed effects; remaining includes eligible work temporarily locked by another owner. */
export type AdmissionPrivateDataRetentionResult = {
  requestsMinimized: number;
  auditEventsPurged: number;
  archivedAuditEventsPurged: number;
  remainingRequests: boolean;
  remainingAuditEvents: boolean;
};
/** Preserves live bindings, decisions, ledgers and charged history while retiring unnecessary private contents. */
export interface AdmissionPrivateDataRetention {
  /** @param command - Trusted bounded batch without a caller-selected clock or resource scope. @returns Only after the original maintenance transaction commits. */
  purge(command: AdmissionPrivateDataRetentionCommand): Promise<AdmissionPrivateDataRetentionResult>;
}
