/** Safe cutover reasons distinguish missing storage, ingress coverage and unresolved membership history. @module admission-preflight-constants */
export const ADMISSION_PREFLIGHT_REASON = {
  scopeMismatch: "preflight_scope_mismatch",
  academyUnavailable: "preflight_academy_unavailable",
  policyUnavailable: "preflight_policy_unavailable",
  markerInconsistent: "preflight_marker_inconsistent",
  storageUnavailable: "preflight_storage_unavailable",
  ingressUnprotected: "preflight_ingress_unprotected",
  unknownCommercialHistory: "preflight_unknown_commercial_history",
  privilegedCommercialMembership: "preflight_privileged_commercial_membership",
  runtimeUnavailable: "preflight_runtime_unavailable",
} as const;

/** Actual enabled trigger inventory required by the stored cutover and membership owners. */
export const ADMISSION_PREFLIGHT_STORAGE_TRIGGERS = [
  { table: "tribes", name: "admission_control_marker_guard" },
  { table: "tribes", name: "admission_first_activation_commit_guard" },
  { table: "academy_admission_membership_effects", name: "admission_membership_effect_creation_guard" },
  { table: "academy_admission_membership_effects", name: "admission_membership_effect_commit_guard" },
  { table: "subscription_membership_effects", name: "subscription_membership_effect_origin_guard" },
  { table: "subscription_membership_effects", name: "subscription_membership_effect_commit_guard" },
  { table: "tribe_members", name: "academy_membership_source_guard" },
  { table: "tribe_members", name: "admission_membership_delete_guard" },
  { table: "tribe_members", name: "subscription_membership_source_delete_guard" },
] as const;

/** Installed SQL lifecycle locks/effects supplement, rather than replace, protected application entrypoints. */
export const ADMISSION_PREFLIGHT_INGRESS_TRIGGERS = [
  { table: "tribe_members", name: "academy_admission_lifecycle_lock" },
  { table: "tribe_members", name: "admission_member_unavailable" },
  { table: "tribe_academy_settings", name: "admission_academy_unavailable" },
  { table: "user", name: "admission_account_unavailable" },
] as const;

/** PostgreSQL's ordinary or always-enabled modes retain the versioned trigger behavior. */
export const ADMISSION_PREFLIGHT_ENABLED_TRIGGER_MODES: readonly string[] = ["O", "A"];

/** Validated relationship constraints prevent using another membership instance or receipt. */
export const ADMISSION_PREFLIGHT_STORAGE_CONSTRAINTS = [
  { table: "academy_admission_membership_effects", name: "admission_membership_effect_decision_fkey" },
  { table: "academy_admission_membership_effects", name: "admission_membership_effect_member_scope_fkey" },
  { table: "tribe_members", name: "tribe_member_admission_effect_fkey" },
  { table: "subscription_membership_effects", name: "subscription_membership_subscription_scope_fkey" },
  { table: "subscription_membership_effects", name: "subscription_membership_member_scope_fkey" },
  { table: "tribe_members", name: "tribe_member_subscription_effect_fkey" },
  { table: "tribe_members", name: "tribe_member_commercial_recovery_check" },
] as const;
/** Helpers retain their actual bounded ACL contract, owner execution and fixed search path. */
export const ADMISSION_PREFLIGHT_OWNER_FUNCTIONS = [
  { name: "resolve_paid_admission_request", signature: "uuid,uuid,text", publicExecution: true },
  { name: "close_unavailable_admission_request", signature: "uuid,text,text", publicExecution: false },
  { name: "guard_admission_decision_commit", signature: "", publicExecution: false },
] as const;
/** Only the explicitly fixed system/public path is accepted for privileged structural helpers. */
export const ADMISSION_PREFLIGHT_FUNCTION_SEARCH_PATHS: readonly string[] = ["search_path=pg_catalog, public", "search_path=pg_catalog,public"];
/** The sole legacy membership provenance policy complements the application entrypoint registry. */
export const ADMISSION_PREFLIGHT_INGRESS_POLICY = "academy_admission_provenance_required";
/** Private membership source storage always retains enabled and forced RLS. */
export const ADMISSION_PREFLIGHT_RLS_TABLES = ["academy_admission_membership_effects", "subscription_membership_effects"] as const;
