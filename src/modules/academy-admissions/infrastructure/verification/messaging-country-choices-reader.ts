/** Maps messaging-owned display countries to admission facts without importing provider or management DTOs. @module messaging-country-choices-reader */
import "server-only";
import type { MessagingApplicantCountryChoicesReader } from "@/src/modules/messaging/domain/repositories/messaging-usage-policy-repository";
import { MessagingSecretAccessError } from "@/src/modules/messaging/domain/errors/messaging-secret-access-error";
import { MESSAGING_ERROR_CODE } from "@/src/modules/messaging/constants/messaging-errors";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/** Uses the sole configuration owner; this display adapter has no sender, writer or budget port. */
export class AdmissionMessagingCountryChoicesReader {
  /** @param messaging - Explicit currently authorized country owner. */
  constructor(private readonly messaging: MessagingApplicantCountryChoicesReader) {}
  /** @param tribeId - Server-resolved tenant. @param sessionId - Native actual session. @returns A copied admission-owned country list, with absence distinct from initialized empty choices. */
  async readForApplicant(tribeId: string, sessionId: string) {
    try {
      const current = await this.messaging.readCountryChoicesForApplicant(tribeId, sessionId);
      if (!current) return null;
      if (current.tribeId !== tribeId) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
      return { tribeId, version: current.version, allowedCountries: [...current.allowedCountries] };
    } catch (error) {
      if (error instanceof MessagingSecretAccessError) throw new AdmissionOperationError(error.code === MESSAGING_ERROR_CODE.permissionDenied ? ADMISSION_ERROR_CODE.permissionDenied : ADMISSION_ERROR_CODE.resourceUnavailable, { cause: error });
      throw error;
    }
  }
}
