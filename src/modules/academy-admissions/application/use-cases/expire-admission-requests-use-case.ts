/** Orchestrates bounded clock-driven request expiration through its own atomic port. @module expire-admission-requests-use-case */
import type { AdmissionRequestExpiration } from "@/src/modules/academy-admissions/domain/repositories/admission-request-expiration";
import { ADMISSION_EXPIRATION_BATCH_LIMIT } from "@/src/modules/academy-admissions/constants/admission-expiration";
import { ADMISSION_ERROR_CODE } from "@/src/modules/academy-admissions/constants/admission-errors";
import { AdmissionExpirationError } from "@/src/modules/academy-admissions/domain/errors/admission-expiration-error";

/** Expires pending requests without fabricating applicant, leader or recent-auth authority. */
export class ExpireAdmissionRequestsUseCase {
  /** @param expiration - Private backend-authorized owner with commit confirmation. */
  constructor(private readonly expiration: AdmissionRequestExpiration) {}

  /**
   * Executes one bounded batch; the database determines eligibility after locks.
   * @param input - Optional private batch bound, independent from the request deadline.
   * @returns The number of expirations whose transaction is confirmed.
   * @throws AdmissionExpirationError for invalid bounds or unconfirmed completion.
   */
  async execute(input: { limit?: number } = {}): Promise<{ expired: number }> {
    const limit = input.limit ?? ADMISSION_EXPIRATION_BATCH_LIMIT.default;
    if (!Number.isInteger(limit) || limit < 1 || limit > ADMISSION_EXPIRATION_BATCH_LIMIT.maximum) {
      throw new AdmissionExpirationError(ADMISSION_ERROR_CODE.invalidInput);
    }
    return { expired: await this.expiration.expire({ limit }) };
  }
}
