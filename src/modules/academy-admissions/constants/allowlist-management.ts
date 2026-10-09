/** Owns immutable list origins and versioned command vocabulary without selecting caller authority. @module allowlist-management-constants */
import { ADMISSION_ERROR_CODE } from "./admission-errors";
export const ALLOWLIST_DATABASE_ORIGIN = { manual: "manual", csv: "import" } as const;
/** Keeps existing public entry mutations separate from a confirmed business denial. */
export const ALLOWLIST_MUTATION_DENIAL = "denied";
/** Known denials can be completed without writing an entry, binding or membership. */
export const ALLOWLIST_MUTATION_DENIAL_CODES = [ADMISSION_ERROR_CODE.allowlistConflict, ADMISSION_ERROR_CODE.invalidInput, ADMISSION_ERROR_CODE.resourceUnavailable] as const;
/** Known business rejection rolls back list/audit staging while the outer original operation can still complete. */
export const ALLOWLIST_EFFECT_SQL = { begin: "savepoint admission_allowlist_effect", rollback: "rollback to savepoint admission_allowlist_effect", release: "release savepoint admission_allowlist_effect" } as const;
