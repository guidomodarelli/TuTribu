/** Outcomes of the consolidated SQL leader guard `public.authorize_admission_leader`. @module admission-leader-guard-constants */
import { ADMISSION_ERROR_CODE, type AdmissionErrorCode } from "./admission-errors";

/** Every outcome the SQL guard returns. */
export type AdmissionLeaderGuardOutcome = "authorized" | "permission_denied" | "resource_unavailable" | "authentication_required";
/** Outcomes that deny the operation. */
export type AdmissionLeaderGuardDenialOutcome = "permission_denied" | "resource_unavailable" | "authentication_required";

export const ADMISSION_LEADER_GUARD_OUTCOME = {
  authorized: "authorized",
  permissionDenied: "permission_denied",
  resourceUnavailable: "resource_unavailable",
  authenticationRequired: "authentication_required",
} as const satisfies Record<string, AdmissionLeaderGuardOutcome>;

/** Closed admission error raised for each denial, the same codes the former sequential guard raised. */
export const ADMISSION_LEADER_GUARD_DENIAL = {
  permission_denied: ADMISSION_ERROR_CODE.permissionDenied,
  resource_unavailable: ADMISSION_ERROR_CODE.resourceUnavailable,
  authentication_required: ADMISSION_ERROR_CODE.authenticationRequired,
} as const satisfies Record<AdmissionLeaderGuardDenialOutcome, AdmissionErrorCode>;
