/** Represents semantic admission failures without HTTP status or public diagnostics. */
import type { AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";

export type { AdmissionErrorCode } from "@/src/modules/academy-admissions/constants/admission-errors";
/** Projected only after the operation owner has confirmed actor/tribe access to its durable ledger. */
export type AdmissionErrorOperation = { operationId: string; state: "started" | "completed" };
export type AdmissionFailure = {
  code: AdmissionErrorCode; cause?: unknown; retryAt?: string; operation?: AdmissionErrorOperation;
};
export type AdmissionPublicError = {
  code: AdmissionErrorCode; message: string; requestId: string; retryAt?: string; operation?: AdmissionErrorOperation;
};

/**
 * Constructs an expected private failure without inventing a cause or durable operation.
 * @param code - Semantic outcome independent of transport.
 * @param details - Real cause and optional facts already resolved by authorized own readers.
 * @returns A private application failure; HTTP creates a separate allowlisted object.
 */
export function admissionFailure(code: AdmissionErrorCode, details: Omit<AdmissionFailure, "code"> = {}): AdmissionFailure {
  return { code, ...details };
}
