/** Types the hosting security failures of reads and preflights that run before any ledger claim. @module admission-platform-security-rejection */
import "server-only";
import { classifyMessagingPlatformSecurityFailure } from "@/src/modules/messaging/infrastructure/config/messaging-platform-security-failure";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/**
 * Runs a read or a preflight that registers nothing, so a hosting security the platform cannot use yet surfaces as the same
 * definitive platform rejection the ledger claim returns, instead of an untyped unexpected failure the browser keeps as uncertain.
 * Never wrap work inside a claimed original: there the ledger keeps the registered original unresolved.
 * @param run - Read or preflight that may import the hosting security or attest its keys.
 * @returns The result of `run`.
 * @throws AdmissionOperationError platform_security_unavailable, with the original failure as cause; any other failure unchanged.
 */
export async function rejectWithoutPlatformSecurity<Result>(run: () => Promise<Result>): Promise<Result> {
  try { return await run(); }
  catch (error) {
    if (!(error instanceof AdmissionOperationError) && classifyMessagingPlatformSecurityFailure(error)) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.platformSecurityUnavailable, { cause: error });
    throw error;
  }
}
