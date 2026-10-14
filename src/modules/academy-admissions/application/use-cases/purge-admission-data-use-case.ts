/** Validates every admission-retention ceiling before the first destructive owner starts. @module purge-admission-data-use-case */
import type { AdmissionDataRetention, AdmissionDataRetentionCommand, AdmissionDataRetentionResult } from "../../domain/repositories/admission-data-retention";
import { AdmissionRetentionError } from "../../domain/errors/admission-retention-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_DATA_RETENTION_OPERATION, ADMISSION_IMPORT_MATERIAL_RETENTION, ADMISSION_PRIVATE_DATA_RETENTION } from "../../constants/admission-retention";

/** Executes a bounded original batch without scheduling, keys, provider calls or implicit retries. */
export class PurgeAdmissionDataUseCase {
  /** @param retention - Explicit atomic private owner. */
  constructor(private readonly retention: AdmissionDataRetention) {}

  /** @param input - Optional private ceilings, validated together before any checkout. @returns Only the transaction-confirmed aggregate. @throws AdmissionRetentionError for invalid input or an unconfirmed batch. */
  async execute(input: Partial<AdmissionDataRetentionCommand> = {}): Promise<AdmissionDataRetentionResult> {
    const command = {
      importRowLimit: input.importRowLimit ?? ADMISSION_IMPORT_MATERIAL_RETENTION.defaultRowLimit,
      requestLimit: input.requestLimit ?? ADMISSION_PRIVATE_DATA_RETENTION.defaultRequestLimit,
      auditLimit: input.auditLimit ?? ADMISSION_PRIVATE_DATA_RETENTION.defaultAuditLimit,
    };
    if (!Number.isInteger(command.importRowLimit) || command.importRowLimit < 1 || command.importRowLimit > ADMISSION_IMPORT_MATERIAL_RETENTION.maximumRowLimit
      || !Number.isInteger(command.requestLimit) || command.requestLimit < 1 || command.requestLimit > ADMISSION_PRIVATE_DATA_RETENTION.maximumRequestLimit
      || !Number.isInteger(command.auditLimit) || command.auditLimit < 1 || command.auditLimit > ADMISSION_PRIVATE_DATA_RETENTION.maximumAuditLimit) {
      throw new AdmissionRetentionError(ADMISSION_ERROR_CODE.invalidInput, undefined, ADMISSION_DATA_RETENTION_OPERATION);
    }
    return this.retention.purge(command);
  }
}
