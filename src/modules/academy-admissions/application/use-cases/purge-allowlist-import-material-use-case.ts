/** Runs one bounded row-minimization batch through its private feature-owned port. @module purge-allowlist-import-material-use-case */
import type { AllowlistImportMaterialRetention, AllowlistImportMaterialRetentionResult } from "../../domain/repositories/allowlist-import-material-retention";
import { AdmissionRetentionError } from "../../domain/errors/admission-retention-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_IMPORT_MATERIAL_RETENTION } from "../../constants/admission-retention";
/** Leaves SQL time, protected references and current backend authority to the persistence owner. */
export class PurgeAllowlistImportMaterialUseCase {
  /** @param retention - Explicit private owner; no browser or provider fallback. */
  constructor(private readonly retention: AllowlistImportMaterialRetention) {}
  /** @param input - Optional total row ceiling. @returns Confirmed safe counts. @throws AdmissionRetentionError for invalid limits or an unresolved owner execution. */
  async execute(input: { limit?: number } = {}): Promise<AllowlistImportMaterialRetentionResult> {
    const limit = input.limit ?? ADMISSION_IMPORT_MATERIAL_RETENTION.defaultRowLimit;
    if (!Number.isInteger(limit) || limit < 1 || limit > ADMISSION_IMPORT_MATERIAL_RETENTION.maximumRowLimit) throw new AdmissionRetentionError(ADMISSION_ERROR_CODE.invalidInput);
    return this.retention.purge({ limit });
  }
}
