/** Bounds numerical statement diagnostics without retaining SQL text or arbitrary object names. */
export type AdmissionStatementOperation = "select" | "with" | "insert" | "update" | "delete" | "begin" | "commit" | "rollback" | "create" | "alter" | "set" | "other";
export const ADMISSION_STATEMENT_OPERATIONS = ["select", "with", "insert", "update", "delete", "begin", "commit", "rollback", "create", "alter", "set", "other"] as const satisfies readonly AdmissionStatementOperation[];
export const ADMISSION_STATEMENT_PROFILE = {
  source: "neon_inspect_db_outliers", scope: "owned_compute_since_start", limit: 25,
  maximumOutputBytes: 4_000_000,
  availableStatus: "available", unavailableStatus: "unavailable", unknownOperation: "other",
  millisecondsPerSecond: 1000, secondsPerMinute: 60, minutesPerHour: 60, hoursPerDay: 24,
  intervalPattern: /^(?:(\d+) days? )?(\d+):([0-5]\d):([0-5]\d(?:\.\d+)?)$/,
  percentagePattern: /^\d+(?:\.\d+)?%$/,
  operationPattern: /^\s*([a-z]+)/i,
  publicObjectPattern: /\bpublic\.(?:"([a-z_][a-z0-9_]*)"|([a-z_][a-z0-9_]*))/gi,
  builtinPattern: /\b(set_config|pg_advisory_xact_lock|clock_timestamp)\s*\(/gi,
  unavailable: "native_statement_inspector_failed",
} as const;
/** Output hints are selected from this closed list; unmatched SQL identifiers are discarded. */
export const ADMISSION_STATEMENT_OBJECTS = [
  "user", "session", "account", "global_session_identity_bindings", "global_identity_evidence", "recent_authentication_evidence",
  "tribes", "tribe_members", "tribe_academy_settings", "academy_admission_policies", "academy_admission_requests", "academy_admission_operations",
  "academy_allowlist_entries", "academy_admission_contact_bindings", "academy_admission_decisions", "academy_admission_membership_effects", "academy_admission_verification_proofs",
  "assert_authorized_messaging_key_material_proof", "assert_messaging_key_material_proof", "check_messaging_key_material_proof", "messaging_key_material_context_is_current",
  "current_app_user_id", "read_admission_reviewer_context", "lock_admission_canonical_leader", "set_config", "pg_advisory_xact_lock", "clock_timestamp",
] as const;
