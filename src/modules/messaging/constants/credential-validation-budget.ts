/** Owns the tribe-scoped moving window of non-message credential checks. @module credential-validation-budget-constants */
import { MILLISECONDS_PER_SECOND, SECONDS_PER_HOUR } from "@/src/constants/time";

/** Serializes credential checks across keys, versions, leaders and devices in one tribe. */
export const CREDENTIAL_VALIDATION_LOCK_DOMAIN = "messaging_credential_validation_tribe";
/** Serializes a backend original operation before resolving its scoped accounting replay. */
export const CREDENTIAL_VALIDATION_OPERATION_LOCK_DOMAIN = "messaging_credential_validation_operation";
/** Uses elapsed time rather than a calendar-hour or local-day reset. */
export const CREDENTIAL_VALIDATION_WINDOW_MS = MILLISECONDS_PER_SECOND * SECONDS_PER_HOUR;
/** Identifies private storage failures without misreporting a contact-resolution operation. */
export const CREDENTIAL_VALIDATION_STORAGE_OPERATION = "reserveCredentialValidation";
