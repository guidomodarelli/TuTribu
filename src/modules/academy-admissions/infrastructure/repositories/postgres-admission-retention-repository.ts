/** Composes existing admission-retention adapters on one guarded transaction and original commit. @module postgres-admission-retention-repository */
import "server-only";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionDataRetention, AdmissionDataRetentionCommand, AdmissionDataRetentionResult } from "../../domain/repositories/admission-data-retention";
import { AdmissionRetentionError } from "../../domain/errors/admission-retention-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_DATA_RETENTION_OPERATION } from "../../constants/admission-retention";
import { PostgresAllowlistImportMaterialRetention, type ImportMaterialRetentionExecutor, type ImportMaterialRetentionGate } from "./postgres-allowlist-import-material-retention";
import { PostgresAdmissionPrivateDataRetention } from "./postgres-admission-private-data-retention";

/** Prevents a later retention failure from committing only the earlier import cleanup. */
export class PostgresAdmissionRetentionRepository implements AdmissionDataRetention {
  /** @param execute - Original owner-only transaction executor. @param authorize - Live private principal. @param readRecoveryLock - Key-independent current recovery stop. */
  constructor(private readonly execute: ImportMaterialRetentionExecutor, private readonly authorize: ImportMaterialRetentionGate, private readonly readRecoveryLock: ImportMaterialRetentionGate) {}

  /** @param database - Original transaction when checked out. @returns After current authority and recovery checks. @throws AdmissionRetentionError when cleanup must stop. */
  private async assertAuthority(database?: RequestDatabase): Promise<void> {
    if (!await this.authorize(database)) throw new AdmissionRetentionError(ADMISSION_ERROR_CODE.permissionDenied, undefined, ADMISSION_DATA_RETENTION_OPERATION);
    if (await this.readRecoveryLock(database)) throw new AdmissionRetentionError(ADMISSION_ERROR_CODE.resourceUnavailable, undefined, ADMISSION_DATA_RETENTION_OPERATION);
    if (!await this.authorize(database)) throw new AdmissionRetentionError(ADMISSION_ERROR_CODE.permissionDenied, undefined, ADMISSION_DATA_RETENTION_OPERATION);
  }

  /** @param command - Application-validated ceilings with independent SQL enforcement. @returns Aggregate effects after one confirmed commit. @throws AdmissionRetentionError preserving the original leaf/commit cause, without retry. */
  async purge(command: AdmissionDataRetentionCommand): Promise<AdmissionDataRetentionResult> {
    try {
      await this.assertAuthority();
      return await this.execute(async (database) => {
        await this.assertAuthority(database);
        const executeOriginal: ImportMaterialRetentionExecutor = async (run) => run(database);
        const imports = new PostgresAllowlistImportMaterialRetention(executeOriginal, this.authorize, this.readRecoveryLock);
        const privateData = new PostgresAdmissionPrivateDataRetention(executeOriginal, this.authorize, this.readRecoveryLock);
        const importResult = await imports.purge({ limit: command.importRowLimit });
        const privateResult = await privateData.purge({ requestLimit: command.requestLimit, auditLimit: command.auditLimit });
        await this.assertAuthority(database);
        return { importMaterial: importResult, privateData: privateResult };
      });
    } catch (error) {
      if (error instanceof AdmissionRetentionError && error.operation === ADMISSION_DATA_RETENTION_OPERATION) throw error;
      throw new AdmissionRetentionError(error instanceof AdmissionRetentionError ? error.code : ADMISSION_ERROR_CODE.operationUnresolved, { cause: error }, ADMISSION_DATA_RETENTION_OPERATION);
    }
  }
}
