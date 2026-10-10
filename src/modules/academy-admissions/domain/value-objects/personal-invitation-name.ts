/** Normalizes required personal invitation labels independently of recipient authority. @module personal-invitation-name */
import { ADMISSION_LIMIT } from "../../constants/admission-limits";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { AdmissionOperationError } from "../errors/admission-operation-error";

/** @param value - Required new administrative label. @returns Its nonempty trimmed value. @throws AdmissionOperationError when absent or outside the product limit. */
export function normalizePersonalInvitationName(value: string): string {
  const name = value?.trim();
  if (!name || name.length > ADMISSION_LIMIT.displayNameCharacters) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  return name;
}
