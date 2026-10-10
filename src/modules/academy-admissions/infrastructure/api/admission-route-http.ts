/** Wires admission-owned failures and DTO guards into the shared private HTTP boundary. */
import "server-only";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { admissionFailure, type AdmissionFailure, type AdmissionPublicError } from "@/src/modules/academy-admissions/application/results/admission-errors";
import { admissionPublicErrorSchema } from "@/src/modules/academy-admissions/application/results/admission-public-result-schemas";
import { createOwnJsonRouteBoundary, type OwnHttpDiagnostic } from "@/src/modules/shared/infrastructure/http/own-json-route-boundary";
import { ADMISSION_ERROR_HTTP_STATUS } from "./admission-error-status";
import { ADMISSION_DIAGNOSTIC_FEATURE } from "../../constants/admission-diagnostics";

/**
 * Builds an own request boundary; application failures never serialize their real private cause.
 * @param input - Native request, fixed route operation and optional own diagnostics sink.
 * @returns Guarded input/output and error response helpers.
 */
export function createAdmissionRouteBoundary(input: { request: Request; operation: string; diagnostics?: (diagnostic: OwnHttpDiagnostic) => void }) {
  return createOwnJsonRouteBoundary<AdmissionFailure, AdmissionPublicError>({
    ...input, feature: ADMISSION_DIAGNOSTIC_FEATURE, errorSchema: admissionPublicErrorSchema,
    invalidInput: () => admissionFailure(ADMISSION_ERROR_CODE.invalidInput),
    unusableContract: () => admissionFailure(ADMISSION_ERROR_CODE.publicContractUnusable),
    unexpectedFailure: (cause) => admissionFailure(ADMISSION_ERROR_CODE.unexpectedFailure, { cause }),
    projectFailure: (failure, requestId) => ({ status: ADMISSION_ERROR_HTTP_STATUS[failure.code], body: {
      code: failure.code, message: ADMISSION_ERROR_MESSAGE[failure.code], requestId,
      ...(failure.retryAt !== undefined ? { retryAt: failure.retryAt } : {}),
      ...(failure.operation !== undefined ? { operation: failure.operation } : {}),
    } }),
  });
}
