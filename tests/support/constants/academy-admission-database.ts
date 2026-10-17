/** Defines the standing native project scope and private resource-ownership guards. @module academy-admission-database-constants */
export const ADMISSION_NEON_PROJECT_ID = "cold-firefly-92947172";
/** Bounds administrative HTTP calls without retrying an uncertain resource mutation. */
export const NEON_ADMIN_TIMEOUT_MS = 15_000;
/** Keeps externally planned nonces inside the same disposable resource family. */
export const ADMISSION_BRANCH_NAME_PREFIX = "codex-academy-admissions-";
/** Rejects ambiguous ownership before any resource can be created, borrowed or removed. */
export const ADMISSION_DATABASE_OWNERSHIP_FAILURE = {
  invalidNonce: "AcademyAdmissionDatabase.authorize failed: invalid_branch_nonce",
  existingName: "AcademyAdmissionDatabase.authorize failed: branch_name_already_exists",
} as const;
