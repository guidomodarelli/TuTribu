/** Names the private hosting-key enrollment command and the diagnostic for unenrolled HMAC material. @module messaging-key-enrollment-constants */
import type { MessagingMacKeyPurpose } from "../domain/value-objects/messaging-key-purpose";
import { MESSAGING_KEY_PURPOSE } from "./messaging-cryptography";

/** Every HMAC purpose whose active and retained key ids must hold an immutable proof before requests use them. */
export const MESSAGING_ENROLLED_MAC_KEY_PURPOSES = [MESSAGING_KEY_PURPOSE.contactFingerprint, MESSAGING_KEY_PURPOSE.operationPayload] as const satisfies readonly MessagingMacKeyPurpose[];

/** Owns the private connection order and the safe failure projection of `pnpm messaging:enroll-keys`. */
export const MESSAGING_KEY_ENROLLMENT = {
  /** Owner/maintenance connections only; the request role `DATABASE_URL` never holds the enrollment privilege. */
  connectionEnvironmentKeys: ["DATABASE_MAINTENANCE_URL", "DATABASE_MIGRATION_URL"],
  poolOperation: "messaging_key_enrollment",
  maximumConnections: 1,
  /** PostgreSQL SQLSTATE codes are five uppercase alphanumerics; only these reach the operator output. */
  sqlStatePattern: /^[0-9A-Z]{5}$/,
} as const;

export type MessagingKeyEnrollmentErrorCode = "messaging_key_enrollment_connection_missing" | "messaging_key_enrollment_failed";

/** Closed command failures that are not cryptographic configuration or continuity codes. */
export const MESSAGING_KEY_ENROLLMENT_ERROR = {
  connectionMissing: "messaging_key_enrollment_connection_missing",
  unexpectedFailure: "messaging_key_enrollment_failed",
} as const satisfies Record<string, MessagingKeyEnrollmentErrorCode>;

/** Operational log emitted when a request finds HMAC material without a matching enrolled proof. */
export const MESSAGING_KEY_MATERIAL_DIAGNOSTIC = {
  feature: "messaging",
  operation: "assertMessagingAuthenticatedMacKeyMaterials",
  requestId: "background",
  unverifiedMessage: "messaging_key_material_unverified",
  remediation: "pnpm messaging:enroll-keys",
} as const;
