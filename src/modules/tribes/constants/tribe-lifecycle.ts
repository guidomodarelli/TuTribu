/** Owns explicit irreversible tribe lifecycle actions and original operation identity. @module tribe-lifecycle-constants */
import { REAUTHENTICATION_OPERATION } from "@/src/modules/auth/constants/reauthentication-resources";
export const TRIBE_LIFECYCLE_ACTION = { exitAcademy: "exit_academy", deleteTribe: "delete_tribe" } as const;
/** Keeps closed action input independent of current member and product states. */
export const TRIBE_LIFECYCLE_ACTIONS = ["exit_academy", "delete_tribe"] as const;
/** Separates lifecycle commands from membership changes and admission approvals. */
export const TRIBE_LIFECYCLE_OPERATION = "change_tribe_lifecycle";
/** Binds scope audit to the verified original only within its committing transaction. */
export const TRIBE_LIFECYCLE_AUDIT_CONTEXT = "app.tribe_lifecycle_operation_id";
/** Fixed operation-scoped reauthentication resources are always the exact tribe. */
export const TRIBE_LIFECYCLE_REAUTHENTICATION = { exitAcademy: REAUTHENTICATION_OPERATION.exitAcademyMode, deleteTribe: REAUTHENTICATION_OPERATION.deleteTribe } as const;
/** Defines minimal safe failures without private database/provider diagnostics. */
export const TRIBE_LIFECYCLE_ERROR = { authenticationRequired: "authentication_required", permissionDenied: "permission_denied", reauthenticationRequired: "reauthentication_required", invalidInput: "invalid_input", resourceUnavailable: "resource_unavailable", lifecycleConflict: "lifecycle_conflict", idempotencyConflict: "idempotency_conflict", operationUnresolved: "operation_unresolved", publicContractUnusable: "public_contract_unusable", unexpectedFailure: "unexpected_failure" } as const;
