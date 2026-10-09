/** Owns immutable list origins and versioned command vocabulary without selecting caller authority. @module allowlist-management-constants */
import { ADMISSION_ERROR_CODE } from "./admission-errors";
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
export const ALLOWLIST_DATABASE_ORIGIN = { manual: "manual", csv: "import" } as const;
/** Keeps existing public entry mutations separate from a confirmed business denial. */
export const ALLOWLIST_MUTATION_DENIAL = "denied";
/** Known denials can be completed without writing an entry, binding or membership. */
export const ALLOWLIST_MUTATION_DENIAL_CODES = [ADMISSION_ERROR_CODE.allowlistConflict, ADMISSION_ERROR_CODE.invalidInput, ADMISSION_ERROR_CODE.resourceUnavailable] as const;
/** Known business rejection rolls back list/audit staging while the outer original operation can still complete. */
export const ALLOWLIST_EFFECT_SQL = { begin: "savepoint admission_allowlist_effect", rollback: "rollback to savepoint admission_allowlist_effect", release: "release savepoint admission_allowlist_effect" } as const;
/** Uses a timestamp/id cursor rather than an offset that can duplicate rows after insertions. */
export const ALLOWLIST_CURSOR_SEPARATOR = "~";
/** PostgreSQL ordering retains microseconds even though JavaScript display dates use milliseconds. */
export const ALLOWLIST_CURSOR_TIMESTAMP_FORMAT = 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"';
export const ALLOWLIST_CURSOR_TIME_ZONE = "UTC";
/** User search text is literal data, including SQL wildcard characters. */
export const ALLOWLIST_SEARCH_PATTERN = /[\\%_]/gu;
export const ALLOWLIST_SEARCH_ESCAPE = "\\$&";
/** The same original namespace can be recovered only by its actor and current leader. */
export const ALLOWLIST_RECOVERABLE_OPERATIONS: readonly string[] = [REAUTHENTICATION_OPERATION.createAllowlistEntry, REAUTHENTICATION_OPERATION.updateAllowlistEntry];
