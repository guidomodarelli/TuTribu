/** Translates unexpected draft validation failures into safe browser feedback. @module validate-browser-admission-whatsapp-number-draft */
import { validateAdmissionWhatsappNumberDraft, type AdmissionWhatsappNumberDraftResult } from "../../application/commands/admission-whatsapp-number-draft";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_WHATSAPP_VALIDATION_OPERATION } from "../../constants/admission-whatsapp-number";

/** @param value - Current declared number; never included in diagnostics. @param required - Observed policy hint, rechecked by the authoritative writer. @returns Normalized draft or safe failure; raw parser errors stay out of logs and UI. */
export function validateBrowserAdmissionWhatsappNumberDraft(value: string | undefined, required: boolean): AdmissionWhatsappNumberDraftResult {
  try { return validateAdmissionWhatsappNumberDraft(value, required); }
  catch (error) {
    console.error(ADMISSION_WHATSAPP_VALIDATION_OPERATION, { category: errorCategory(error) });
    return { valid: false, code: ADMISSION_ERROR_CODE.unexpectedFailure };
  }
}

/** @param error - Unexpected validation failure. @returns Only its broad built-in category, never its message. */
function errorCategory(error: unknown): "TypeError" | "RangeError" | "Error" {
  if (error instanceof TypeError) return "TypeError";
  return error instanceof RangeError ? "RangeError" : "Error";
}
