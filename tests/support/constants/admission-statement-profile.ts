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
  identifierPattern: /[a-z_][a-z0-9_]*/gi,
  scalarProjectionPattern: /^\s*select\s+\$\d+\s*;?\s*$/i,
  trackingSetting: "pg_stat_statements.track", planningSetting: "pg_stat_statements.track_planning", versionSetting: "server_version_num",
  unavailable: "native_statement_inspector_failed",
} as const;
/** Output hints are selected from this closed list; unmatched SQL identifiers are discarded. */
export const ADMISSION_STATEMENT_OBJECTS = [
  "user", "session", "account", "global_session_identity_bindings", "global_identity_evidence", "recent_authentication_evidence",
  "tribes", "tribe_members", "tribe_academy_settings", "academy_admission_policies", "academy_admission_requests", "academy_admission_operations",
  "academy_allowlist_entries", "academy_admission_contact_bindings", "academy_admission_decisions", "academy_admission_membership_effects", "academy_admission_verification_proofs",
  "academy_admission_audit_events", "academy_allowlist_import_rows", "academy_allowlist_import_selections", "academy_allowlist_imports", "academy_personal_invitations",
  "close_academy_admission_scope", "close_unavailable_admission_request", "contact_verification_challenges", "create_admission_notification_obligation", "enqueue_admission_notification",
  "expire_academy_admission_requests", "lock_academy_admission_administrative_reader", "message_deliveries", "message_delivery_attempts",
  "messaging_connection_capabilities", "messaging_connection_diagnostics", "messaging_connection_versions", "messaging_contact_budget_subjects", "messaging_contact_fingerprint_aliases",
  "messaging_secret_envelopes", "messaging_usage_events", "messaging_usage_policies", "purge_admission_private_data", "purge_expired_allowlist_import_material",
  "read_academy_admission_activity", "read_academy_admission_metrics", "read_admission_contact_choices", "read_admission_review_history", "read_admission_reviews", "read_legacy_admission_invitation",
  "read_own_admission_operations", "read_own_admission_request_eligibility", "read_own_admission_request_summary", "read_public_admission_overview",
  "record_academy_admission_administrative_exposure", "record_academy_admission_authorized_exposure", "resolve_paid_admission_request", "tenant_messaging_connections", "verification_code_envelopes",
  "assert_authorized_messaging_key_material_proof", "assert_messaging_key_material_proof", "check_messaging_key_material_proof", "messaging_key_material_context_is_current",
  "current_app_user_id", "read_admission_reviewer_context", "lock_admission_canonical_leader", "set_config", "pg_advisory_xact_lock", "pg_advisory_xact_lock_shared", "pg_try_advisory_xact_lock", "pg_sleep", "current_setting", "clock_timestamp", "transaction_timestamp",
] as const;
