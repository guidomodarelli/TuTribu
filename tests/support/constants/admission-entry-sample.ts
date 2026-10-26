/** Owns the authorized synthetic cohort, strict timing criterion and private fixture boundaries. @module admission-entry-sample-constants */
export const ADMISSION_ENTRY_SAMPLE = {
  accounts: 10,
  minimumCompletions: 9,
  completionLimitMs: 120_000,
  testTimeoutMs: 900_000,
  requestTimeoutMs: 30_000,
  passwordBytes: 24,
  viewportHeight: 900,
  widths: [390, 1280],
  authPrefix: "/api/auth",
  sessionPath: "/api/auth/get-session",
  securityEnvironment: "synthetic-admission-entry",
  poolOperation: "admission_entry_sample_auth_pool",
  reportName: "admission-entry-sample.json",
  method: "automated_functional",
  message: "Quiero participar en esta academia de prueba.",
  academyAccessModel: "academy",
  tribeName: "Academia del ensayo de ingreso",
} as const;

/** Records the last public interaction reached by each observation, including failed positions. */
export const ADMISSION_ENTRY_SAMPLE_PHASE = {
  prepared: "prepared", navigation: "navigation", message: "message", confirmation: "confirmation",
  submission: "submission", pending: "pending", replay: "replay", completed: "completed",
} as const;

/** Identifies failures without exporting browser call logs, credentials or provider payloads. */
export const ADMISSION_ENTRY_SAMPLE_FAILURE = {
  authUnavailable: "AdmissionEntrySample.authenticate failed: native_auth_unavailable",
  signInRejected: "AdmissionEntrySample.authenticate failed: sign_in_rejected",
  sessionUnconfirmed: "AdmissionEntrySample.authenticate failed: application_session_unconfirmed",
  identityReused: "AdmissionEntrySample.authenticate failed: independent_identity_required",
  invalidCohort: "AdmissionEntrySample.prepare failed: invalid_cohort_size",
  deadline: "AdmissionEntrySample.measure failed: completion_deadline",
  requestUnconfirmed: "AdmissionEntrySample.measure failed: request_unconfirmed",
  recoveryUnconfirmed: "AdmissionEntrySample.measure failed: original_replay_unconfirmed",
  browserCleanup: "AdmissionEntrySample.cleanup failed: browser_resource_unconfirmed",
} as const;
