/** Applies the actual scope, archive and original owners before lifecycle audit validation. @module tribe-lifecycle-audit-test-constants */
export const TRIBE_RETIREMENT_PROVENANCE_MIGRATIONS = [
  "20261010100000_minimize_deleted_admission_contact_owners.sql",
  "20261010113000_preserve_admission_tribe_namespaces.sql",
  "20261010120000_archive_deleted_admission_tribe_provenance.sql",
  "20261010121000_retire_deleted_tribe_messaging.sql",
  "20261011223000_close_admission_scope_lifecycle.sql",
  "20261014030211_audit_scope_closed_verification_proofs.sql",
  "20261014052150_audit_tribe_lifecycle_scope_retirement.sql",
] as const;
/** Reuses the already applied subscription boundary when a fixture only needs the provenance suffix. */
export const TRIBE_LIFECYCLE_AUDIT_MIGRATIONS = [
  "20261005100000_guard_messaging_secret_retirement.sql",
  "20261006180000_guard_subscription_membership_sources.sql",
  "20261007020000_resolve_paid_admission_requests.sql",
  "20261007023000_close_unavailable_admission_requests.sql",
  ...TRIBE_RETIREMENT_PROVENANCE_MIGRATIONS,
] as const;
/** Preserves the already implemented owners' closed cancellation causes across physical archival. */
export const RETIRED_DELIVERY_CANCELLATION_CAUSES = ["explicit_resend", "suspected_compromise", "connection_replaced", "candidate_expired"] as const;
