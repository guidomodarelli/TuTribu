/** Normalizes a declared WhatsApp number and proposes own pending edits without identity authority. @module admission-whatsapp-number */
import type { AdmissionRequest } from "../entities/admission-request";
import type { AdmissionPolicy } from "../entities/admission-policy";
import { normalizeAdmissionContact } from "./admission-contact";
import { AdmissionOperationError } from "../errors/admission-operation-error";
import { ADMISSION_CONTACT_TYPE, ADMISSION_CONTACT_NORMALIZATION_STATUS } from "../../constants/admission-contact";
import { ADMISSION_ERROR_CODE, type AdmissionErrorCode } from "../../constants/admission-errors";
import { ADMISSION_REQUEST_STATUS } from "../../constants/admission-request";
import { ADMISSION_WHATSAPP_CHANGE_OUTCOME } from "../../constants/admission-whatsapp-number";

/**
 * Canonicalizes an international declared number without proving possession or group membership.
 * @param value - Optional declared number; missing or blank means no number.
 * @returns Canonical E.164 or absence, independently of messaging country configuration.
 * @throws AdmissionOperationError for an invalid number, with no raw input diagnostic.
 */
export function normalizeAdmissionWhatsappNumber(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  const result = normalizeAdmissionContact({ type: ADMISSION_CONTACT_TYPE.phone, value });
  if (result.status !== ADMISSION_CONTACT_NORMALIZATION_STATUS.valid) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  return result.contact.value;
}

/** A proposal never changes a proof, contact binding, request status or original deadline. */
export type AdmissionWhatsappNumberChange =
  | { outcome: "denied"; code: AdmissionErrorCode }
  | { outcome: "changed" | "unchanged"; request: AdmissionRequest };

/**
 * Proposes one own pending correction using the current leader requirement and observed request version.
 * @param input - Current scoped request/policy, native actor, canonical number and post-lock clock.
 * @returns A denial, original no-op, or detached versioned request; the writer owns replay and atomic CAS.
 */
export function proposeAdmissionWhatsappNumberChange(input: {
  request: AdmissionRequest; policy: Pick<AdmissionPolicy, "tribeId" | "requiresWhatsappNumber">;
  actorUserId: string; expectedVersion: number; whatsappNumber: string | null; now: Date;
}): AdmissionWhatsappNumberChange {
  const { request } = input;
  const denied = (code: AdmissionErrorCode): AdmissionWhatsappNumberChange => ({ outcome: ADMISSION_WHATSAPP_CHANGE_OUTCOME.denied, code });
  if (request.userId !== input.actorUserId || request.tribeId !== input.policy.tribeId) return denied(ADMISSION_ERROR_CODE.permissionDenied);
  if (request.status !== ADMISSION_REQUEST_STATUS.pending || request.version !== input.expectedVersion) return denied(ADMISSION_ERROR_CODE.requestConflict);
  if (!Number.isFinite(input.now.getTime()) || input.now < request.submittedAt) return denied(ADMISSION_ERROR_CODE.admissionIneligible);
  if (input.now >= request.expiresAt) return denied(ADMISSION_ERROR_CODE.requestExpired);
  if (input.policy.requiresWhatsappNumber && !input.whatsappNumber) return denied(ADMISSION_ERROR_CODE.whatsappNumberRequired);
  if ((request.whatsappNumber ?? null) === input.whatsappNumber) return { outcome: ADMISSION_WHATSAPP_CHANGE_OUTCOME.unchanged, request };
  return { outcome: ADMISSION_WHATSAPP_CHANGE_OUTCOME.changed, request: { ...request, whatsappNumber: input.whatsappNumber, version: request.version + 1 } };
}
