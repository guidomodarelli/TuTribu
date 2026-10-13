/** Normalizes optional allowlist labels without granting any identity authority. @module allowlist-display-name */
import { ADMISSION_LIMIT } from "../../constants/admission-limits";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { AdmissionOperationError } from "../errors/admission-operation-error";

/** @param value - Proposed explanatory name or absence. @returns A trimmed name or null. @throws AdmissionOperationError when the product name limit is exceeded. */
export function normalizeAllowlistDisplayName(value: string | null | undefined): string | null {
  const normalized = value?.trim() || null;
  if (normalized && normalized.length > ADMISSION_LIMIT.displayNameCharacters) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.invalidInput);
  return normalized;
}
