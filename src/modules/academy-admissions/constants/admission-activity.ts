/** Names bounded private history and its closed public projection. @module admission-activity-constants */
import { ADMISSION_AUDIT_RESOURCE_TYPE } from "./admission-audit";
import { ADMISSION_ERROR_CODE } from "./admission-errors";
import { ADMISSION_QUERY_LIMIT } from "./admission-public-contract";
import { VERIFICATION_ISSUANCE_OPERATION } from "./verification-issuance";
import { MESSAGE_STORAGE_OPERATION } from "@/src/modules/messaging/constants/message-delivery";
import { ADMISSION_ADMINISTRATIVE_SURFACE } from "./admission-administrative-exposure";
import { MESSAGING_SECRET_HUMAN_OPERATIONS, MESSAGING_SECRET_DELIVERY_SCOPE } from "@/src/modules/messaging/constants/messaging-secret-access";
import { ADMISSION_NOTIFICATION_AUDIT } from "@/src/modules/notifications/constants/admission-notification-audit";
import { ADMISSION_PRIVATE_DATA_RETENTION } from "./admission-retention";

/** Paginates newest-first using the original SQL timestamp, including its microseconds. */
export const ADMISSION_ACTIVITY_QUERY = { defaultLimit: ADMISSION_QUERY_LIMIT.defaultPageSize, maximumLimit: ADMISSION_QUERY_LIMIT.maximumPageSize, cursorSeparator: "|" } as const;
/** Supports exact newest-first resource selection without changing the private audit row contract. */
export const ADMISSION_ACTIVITY_DATABASE = { resourceHistoryIndex: "admission_audit_resource_history_idx" } as const;
/** Closes projection-only vocabularies without accepting arbitrary free audit metadata. */
export const ADMISSION_ACTIVITY_SURFACES = ["activity", "metrics", ...Object.values(ADMISSION_ADMINISTRATIVE_SURFACE), "connection_resources", "operational_secret"] as const;
/** Classifies authorized read extent without exposing its content. */
export const ADMISSION_ACTIVITY_RESOURCE_KINDS = ["senders", "templates", "entries", "requests", "invitations", "aggregate", "credential"] as const;
/** Identifies the owner of a retention observation without a caller-selected table name. */
export const ADMISSION_ACTIVITY_RETENTION_OWNERS = ["admission_requests", "admission_audit", "allowlist_import_material", "messaging_secrets", "verification_material", "messaging_candidates"] as const;
/** Accepts only the persisted ISO country code form selected by the usage owner. */
export const ADMISSION_ACTIVITY_COUNTRY_PATTERN = /^[A-Z]{2}$/;
/** Does not create a command ledger for an authorized read. */
export const ADMISSION_ACTIVITY_READ_RULE = { activity: "read_admission_activity", metrics: "read_admission_metrics", allowlist: "read_allowlist_entries", allowlistReport: "read_allowlist_report", invitations: "read_personal_invitations", reviews: "read_admission_reviews" } as const;
/** Records private read extent without a content copy or fictional ledger/version. */
export const ADMISSION_ACTIVITY_EXPOSURE = { event: "authorized_resource_exposure", resourceKind: "aggregate" } as const;
/** Keeps policy and the existing resource vocabulary in a single owned selection. */
export const ADMISSION_ACTIVITY_RESOURCE = { ...ADMISSION_AUDIT_RESOURCE_TYPE, policy: "admission_policy" } as const;
/** Never publishes an unknown storage discriminator as an arbitrary label. */
export const ADMISSION_ACTIVITY_UNCLASSIFIED_EVENT = "unclassified";
/** Limits event names to implemented owner facts, independently of resource or exception text. */
export const ADMISSION_ACTIVITY_EVENTS = [
  "initialize_admission_policy", "update_admission_policy", "activate_admission_policy", "pause_admission_policy", "messaging_selection_replaced", "proof_attached",
  "pending_created", "approved", "rejected", "cancelled", "expired", "retry_allowed",
  "create_allowlist_entry", "update_allowlist_entry", "confirm_allowlist_import",
  "create_personal_invitation", "rename_personal_invitation", "revoke_personal_invitation", "personal_invitation_redeemed",
  "initialize_messaging_usage", "update_messaging_usage", "save_messaging_credentials", "validate_messaging_connection", "configure_messaging_connection",
  "activate_messaging_connection", "suspend_messaging_connection", "disconnect_messaging_connection", "messaging_connection_compromised", "messaging_connection_retired",
  "authorized_resource_exposure", "delivery_created", "delivery_attempt_started", "delivery_accepted", "delivery_delivered", "delivery_failed", "delivery_unknown",
  "delivery_suppressed", "delivery_deferred", "delivery_cancelled", "delivery_reconciled", "notification_delivery_recovered",
  ADMISSION_NOTIFICATION_AUDIT.obligationCreated, ADMISSION_NOTIFICATION_AUDIT.materialized,
  "proof_created", "proof_applied", "proof_invalidated", "proof_expired", "membership_admitted", "membership_revoked", "membership_role_changed",
  "protection_keys_rotated", "secret_retired", "secret_purged", "recovery_locked", "retention_completed", ADMISSION_ACTIVITY_UNCLASSIFIED_EVENT,
] as const;
/** Closed rules exclude free administrative notes and provider messages from this public history. */
export const ADMISSION_ACTIVITY_RULES = [
  ...ADMISSION_ACTIVITY_EVENTS, "manual_review", "applicant_cancellation", "management_cancellation", "automatic", "external_resolution", "academy_unavailable",
  ADMISSION_NOTIFICATION_AUDIT.createRule, ADMISSION_NOTIFICATION_AUDIT.materializeRule,
  ADMISSION_PRIVATE_DATA_RETENTION.requestRule, ADMISSION_PRIVATE_DATA_RETENTION.auditRule,
  "tribe_deleted", "account_deleted", "membership_deleted", "nonrecoverable_membership", "leader_corrective_retry", "local_verification",
  "messaging_connection_replaced", "issue_contact_verification", "resend_contact_verification", "explicit_resend", "suspected_compromise", "connection_replaced",
  "candidate_expired", "accepted", "delivered", "rejected", "unknown", "quota_exceeded", "lease_expired", "reconcile_messaging_delivery",
  ...Object.values(ADMISSION_ACTIVITY_READ_RULE),
  VERIFICATION_ISSUANCE_OPERATION.issue, VERIFICATION_ISSUANCE_OPERATION.resend,
  MESSAGE_STORAGE_OPERATION.authorize, MESSAGE_STORAGE_OPERATION.complete, MESSAGE_STORAGE_OPERATION.reconcile,
  ...MESSAGING_SECRET_HUMAN_OPERATIONS, MESSAGING_SECRET_DELIVERY_SCOPE.operation,
] as const;
/** Safe causes remain separate from arbitrary exception labels and body content. */
export const ADMISSION_ACTIVITY_CAUSES = [
  ...Object.values(ADMISSION_ERROR_CODE), "authorized_connection_replacement", "connection_replaced", "messaging_connection_replaced", "connection_disconnected",
  "suspected_compromise", "security_stop", "ordinary_retirement", "scheduled_expiration", "scope_retired", "policy_verification_context_changed", "explicit_resend", "candidate_expired",
  "provider_accepted", "provider_delivered", "provider_rejected", "dispatch_result_unknown", "worker_lease_expired", "delivery_expired", "security_context_changed",
  "connection_unavailable", "leadership_changed", "credentials_unprepared", "test_mode_connection", "challenge_unavailable", "capability_unprepared", "diagnostic_unavailable", "quota_exceeded",
] as const;
/** States are output dimensions rather than free text extracted from notes. */
export const ADMISSION_ACTIVITY_STATES = ["pending", "approved", "rejected", "cancelled", "expired", "enabled", "disabled", "active", "revoked", "redeemed", "draft", "ready", "degraded", "suspended", "disconnected", "queued", "accepted", "delivered", "failed", "unknown", "suppressed", "available", "applied", "invalid", "muted", "blocked", "removed", "not_validated", "valid", "unavailable"] as const;
/** Copies only reconstructible owner facts, never contact, code, key, ciphertext, token or descriptive notes. */
export const ADMISSION_ACTIVITY_CHANGE_FIELDS = [
  "fromState", "toState", "fromStatus", "toStatus", "previousVersion", "previousRequestVersion", "policyVersion", "verificationEpoch", "configurationVersion", "previousConfigurationVersion",
  "channel", "requestId", "proofId", "challengeId", "decisionId", "invitationId", "importId", "connectionId", "previousConnectionId", "connectionVersion", "previousConnectionVersion",
  "attemptId", "authorizedUsagePolicyVersion", "originalDeliveryId", "targetConnectionId", "originalConnectionId", "originalConnectionVersion", "originalFromState", "originalToState",
  "previousOriginalVersion", "originalVersion", "originalAttemptId", "originalAuthorizedUsagePolicyVersion", "contactType", "fromAuthorizationRevoked", "toAuthorizationRevoked",
  "allowedCountries", "verificationDailyLimit", "notificationDailyLimit", "membershipInstanceId", "fromRole", "toRole", "surface", "itemCount", "resourceKind",
  "owner", "processed", "remaining", "cutoff", "purpose", "previousKeyId", "activeKeyId", "securityEpoch", "previousCredentialState", "credentialState", "credentialMode",
  "obligationId", "requestVersion", "sourceEvent", "audience", "durationMs",
] as const;
