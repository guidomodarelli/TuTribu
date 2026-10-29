/** Derives the applicant contact from a proposed phone or, by default, the native account email. @module admission-applicant-contact */
import type { AuthenticatedAccount } from "@/src/modules/auth/domain/entities/authenticated-account";
import { normalizeAdmissionContact } from "../../domain/value-objects/admission-contact";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_CONTACT_TYPE } from "../../constants/admission-contact";

/**
 * The browser may propose a phone; the email always comes from the server account.
 * @param proposal - Optional proposed phone and its country.
 * @param account - Live native account.
 * @returns The normalization of the proposed phone, else of the account email.
 * @throws AdmissionOperationError when a country arrives without a phone.
 */
export function normalizeApplicantContact(proposal: { phone?: string; country?: string }, account: Pick<AuthenticatedAccount, "normalizedEmail">) {
  if (proposal.country && !proposal.phone) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  return normalizeAdmissionContact(proposal.phone ? { type: ADMISSION_CONTACT_TYPE.phone, value: proposal.phone, country: proposal.country } : { type: ADMISSION_CONTACT_TYPE.email, value: account.normalizedEmail });
}
