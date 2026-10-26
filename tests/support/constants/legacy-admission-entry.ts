/** Owns native historical entry fixture settings without granting admission exemptions. @module legacy-admission-entry-test-constants */
/** Bounds an actual owned branch and its cleanup; the token itself is generated at runtime. */
export const LEGACY_ADMISSION_SQL_TEST_TIMEOUT_MS = 180_000;
/** Matches the existing opaque historical invitation format without persisting its bearer. */
export const LEGACY_ADMISSION_TOKEN_BYTE_LENGTH = 32;
/** Identifies only the documented ledger/manual policy version in the fixture. */
export const LEGACY_ADMISSION_MANUAL_POLICY_VERSION = 3;
/** PostgreSQL denies edits under the original restricted invitation policies. */
export const LEGACY_ADMISSION_PERMISSION_SQLSTATE = "42501";
/** Current list policy starts at this version in the owned entry fixture. */
export const LEGACY_ADMISSION_LIST_POLICY_VERSION = 2;
