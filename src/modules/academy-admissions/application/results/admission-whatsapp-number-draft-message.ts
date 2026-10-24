/** Localizes declared-number field validation independently of transport. @module admission-whatsapp-number-draft-message */
import type { AdmissionWhatsappNumberDraftResult } from "../commands/admission-whatsapp-number-draft";
import { ADMISSION_ERROR_CODE, ADMISSION_ERROR_MESSAGE } from "../../constants/admission-errors";
import { ADMISSION_WHATSAPP_COPY } from "../../constants/admission-whatsapp-number";

/** @param result - Own semantic draft failure only. @returns Safe Spanish field feedback without diagnostics or the entered number. */
export function getAdmissionWhatsappNumberDraftMessage(result: Extract<AdmissionWhatsappNumberDraftResult, { valid: false }>): string {
  return result.code === ADMISSION_ERROR_CODE.invalidInput ? ADMISSION_WHATSAPP_COPY.invalid : ADMISSION_ERROR_MESSAGE[result.code];
}
