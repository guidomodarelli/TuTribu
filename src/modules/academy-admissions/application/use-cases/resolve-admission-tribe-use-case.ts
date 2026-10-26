/** Resolves boundary-validated public slugs to internal admission scope without effects. @module resolve-admission-tribe-use-case */
import type { AdmissionTribeIdentityReader } from "@/src/modules/academy-admissions/domain/repositories/admission-query-reader";
import { AdmissionOperationError } from "@/src/modules/academy-admissions/domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { admissionOperationFailure } from "../results/admission-operation-failure";
/** The resolved UUID is internal routing scope, never a permission or a public response. */
export class ResolveAdmissionTribeUseCase {
  /** @param reader - Own public identity projection. */
  constructor(private readonly reader: AdmissionTribeIdentityReader) {}
  /** @param query - Validated slug and safe correlation. @returns Current internal identity or a safe unavailable result. */
  async execute(query: { slug: string; requestId: string }) {
    try {
      const identity = await this.reader.readIdentity(query);
      if (!identity || identity.slug !== query.slug) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.resourceUnavailable);
      return { ok: true as const, value: { tribeId: identity.id } };
    } catch (error) { return admissionOperationFailure(error); }
  }
}
