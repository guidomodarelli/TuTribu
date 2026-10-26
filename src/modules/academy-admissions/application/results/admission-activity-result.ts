/** Defines the owned private history projection without exposing storage/provider objects. @module admission-activity-result */
import type { z } from "zod";
import { admissionActivityPageSchema } from "../../constants/admission-activity-schemas";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
export { admissionActivityPageSchema } from "../../constants/admission-activity-schemas";
/** A public application DTO guarded at every consumer boundary. */
export type AdmissionActivityPage = z.infer<typeof admissionActivityPageSchema>;
/** @param value - Own projected history about to cross a boundary. @param tribeId - Native authorized scope. @returns A safe same-tribe page. @throws AdmissionOperationError for an unusable own public contract. */
export function parseAdmissionActivityPage(value: unknown, tribeId: string): AdmissionActivityPage {
  const parsed = admissionActivityPageSchema.safeParse(value);
  if (!parsed.success || parsed.data.tribeId !== tribeId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.publicContractUnusable);
  return parsed.data;
}
