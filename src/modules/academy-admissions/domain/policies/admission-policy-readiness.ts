/** Distinguishes operational activation from harmless closure or declared-data settings. @module admission-policy-readiness */
import type { AdmissionPolicy } from "../entities/admission-policy";
import { ADMISSION_POLICY_EDITABLE_FIELDS } from "../../constants/admission-policy";

/** @param current - Original locked configuration. @param next - Proposed own configuration. @returns Whether the change enables operational capability and must recheck prepared messaging resources. */
export function requiresAdmissionPolicyReadiness(current: AdmissionPolicy, next: AdmissionPolicy): boolean {
  if (!current.activatedAt) return false;
  const onlyPausing = current.isOpen && !next.isOpen && ADMISSION_POLICY_EDITABLE_FIELDS.every((field) => field === "isOpen" || current[field] === next[field]);
  const onlyDeclaredNumber = ADMISSION_POLICY_EDITABLE_FIELDS.every((field) => field === "requiresWhatsappNumber" || current[field] === next[field]);
  return !onlyPausing && !onlyDeclaredNumber;
}
