/** Defines a dedicated own-data command without expanding reviewer or messaging ports. @module admission-whatsapp-number-writer */
import type { AdmissionCommandScope } from "./admission-repositories";
import type { AdmissionOperationResult } from "../entities/admission-operation";

/** Only the normalized number enters the private fingerprint, never the minimal public result. */
export type AdmissionWhatsappNumberIntent = AdmissionCommandScope & {
  admissionRequestId: string; operationId: string; expectedVersion: number; confirmed: true; whatsappNumber: string | null;
};
/** Confirmed history contains no declared number or contact/evidence authority. */
export type AdmissionWhatsappNumberResult = { admissionRequestId: string; version: number; changed: boolean };
/** The implementation owns current ownership, policy, replay, version CAS and audit in one transaction. */
export interface AdmissionWhatsappNumberWriter {
  updateWhatsappNumber(intent: AdmissionWhatsappNumberIntent): Promise<AdmissionOperationResult<AdmissionWhatsappNumberResult>>;
}
