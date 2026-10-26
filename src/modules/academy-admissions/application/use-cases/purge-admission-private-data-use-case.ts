/** Runs the private terminal-content and security-audit retention owners with independent bounded batches. @module purge-admission-private-data-use-case */
import type { AdmissionPrivateDataRetention, AdmissionPrivateDataRetentionResult } from "../../domain/repositories/admission-private-data-retention";
import { AdmissionRetentionError } from "../../domain/errors/admission-retention-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_PRIVATE_DATA_RETENTION } from "../../constants/admission-retention";

/** Leaves SQL clocks, irreversible minimization and current maintenance authority with the persistence owner. */
export class PurgeAdmissionPrivateDataUseCase {
  /** @param retention - Mandatory private owner; no browser, provider or missing-hook fallback. */
  constructor(private readonly retention: AdmissionPrivateDataRetention) {}

  /** @param input - Optional independent ceilings; dates and table names are not accepted. @returns Confirmed aggregate progress. @throws AdmissionRetentionError for unusable bounds or an unresolved owner execution. */
  async execute(input: { requestLimit?: number; auditLimit?: number } = {}): Promise<AdmissionPrivateDataRetentionResult> {
    const requestLimit = input.requestLimit ?? ADMISSION_PRIVATE_DATA_RETENTION.defaultRequestLimit;
    const auditLimit = input.auditLimit ?? ADMISSION_PRIVATE_DATA_RETENTION.defaultAuditLimit;
    if (!Number.isInteger(requestLimit) || requestLimit < 1 || requestLimit > ADMISSION_PRIVATE_DATA_RETENTION.maximumRequestLimit || !Number.isInteger(auditLimit) || auditLimit < 1 || auditLimit > ADMISSION_PRIVATE_DATA_RETENTION.maximumAuditLimit) {
      throw new AdmissionRetentionError(ADMISSION_ERROR_CODE.invalidInput, undefined, ADMISSION_PRIVATE_DATA_RETENTION.operation);
    }
    return this.retention.purge({ requestLimit, auditLimit });
  }
}
