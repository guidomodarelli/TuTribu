/** Bounds synthetic review-history fixtures without changing product limits. @module admission-review-history-validation */
import { ADMISSION_POLICY_MODE } from "@/src/modules/academy-admissions/constants/admission-policy";
import { ADMISSION_CONTACT_TYPE } from "@/src/modules/academy-admissions/constants/admission-contact";

/** Fixture-only pagination, compatibility and privacy markers stay independent of public permission. */
export const ADMISSION_REVIEW_HISTORY_VALIDATION = {
  fractionalMicroseconds: 123456,
  scannedPageSize: 2,
  invalidLimit: 52,
  expectedReadExposures: 8,
  eventOffsetsMicroseconds: [0, 1, 1, 2],
  middleCursorPattern: /\.123457Z$/u,
  sqlObjectNamePattern: /^[a-z_][a-z0-9_]{0,126}$/u,
  sqlGuardPattern: /^PL\/pgSQL function ([a-z_][a-z0-9_]*)\(/u,
  originalPolicy: { version: 1, verificationEpoch: 1, mode: ADMISSION_POLICY_MODE.manualReview, contactType: ADMISSION_CONTACT_TYPE.email, requiresAdditionalVerification: false, allowCommonExceptions: false },
  stages: { prepare: "prepare_owned_fixture", migrate: "migrate_owned_fixture", sessions: "seed_native_sessions", activation: "activate_native_scopes", requests: "seed_pending_requests", history: "seed_owned_audit_records", grants: "grant_non_bypass_scope", read: "read_real_history_function", exposure: "verify_original_request_exposures", revoke: "revoke_current_role_and_session" },
  privateNote: "Nota privada del fixture de historial",
  unknownEvent: "legacy_review_observation",
  unknownCause: "legacy_private_cause",
} as const;
