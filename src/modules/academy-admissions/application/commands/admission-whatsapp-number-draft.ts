/** Validates declared-number drafts for pre-action feedback without granting server authority. @module admission-whatsapp-number-draft */
import { normalizeAdmissionWhatsappNumber } from "../../domain/value-objects/admission-whatsapp-number";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/** Client hints use the same canonical number contract while the writer rechecks the current policy. */
export type AdmissionWhatsappNumberDraftResult = { valid: true; value: string | null } | { valid: false; code: "invalid_input" | "whatsapp_number_required" | "unexpected_failure" };

/** @param value - Current user draft, without an inferred account phone. @param required - Last observed policy hint, never server permission. @returns A canonical value or a safe field error. @throws Unexpected library failures for the owning UI boundary to report. */
export function validateAdmissionWhatsappNumberDraft(value: string | undefined, required: boolean): AdmissionWhatsappNumberDraftResult {
  try {
    const number = normalizeAdmissionWhatsappNumber(value);
    return required && !number ? { valid: false, code: ADMISSION_ERROR_CODE.whatsappNumberRequired } : { valid: true, value: number };
  } catch (error) {
    if (error instanceof AdmissionOperationError && error.code === ADMISSION_ERROR_CODE.invalidInput) return { valid: false, code: ADMISSION_ERROR_CODE.invalidInput };
    throw error;
  }
}
