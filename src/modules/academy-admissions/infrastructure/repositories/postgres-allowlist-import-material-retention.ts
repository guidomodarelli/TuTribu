/** Publishes irreversible temporary-import minimization only after current authority and confirmed commit. @module postgres-allowlist-import-material-retention */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AllowlistImportMaterialRetention, AllowlistImportMaterialRetentionResult } from "../../domain/repositories/allowlist-import-material-retention";
import { AdmissionRetentionError } from "../../domain/errors/admission-retention-error";
import { ADMISSION_IMPORT_MATERIAL_RETENTION } from "../../constants/admission-retention";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";

/** Uses one owner-only guarded transaction; no nested checkout or provider call. */
export type ImportMaterialRetentionExecutor = <Result>(run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Reads only current private authority/recovery facts, without loading any keyring. */
export type ImportMaterialRetentionGate = (database?: RequestDatabase) => Promise<boolean>;

/** Preserves completed rows, entry effects, original ledgers and their timestamps during material destruction. */
export class PostgresAllowlistImportMaterialRetention implements AllowlistImportMaterialRetention {
  /** @param execute - Existing private guarded maintenance executor. @param authorize - Live backend authorization. @param readRecoveryLock - Current restore gate without decrypting file or contact data. */
  constructor(private readonly execute: ImportMaterialRetentionExecutor, private readonly authorize: ImportMaterialRetentionGate, private readonly readRecoveryLock: ImportMaterialRetentionGate) {}
  /** @param database - Current transaction when available. @returns Only after both current gates and the post-await authorization succeed. @throws AdmissionRetentionError for withdrawn authority or recovery. */
  private async assertAuthority(database?: RequestDatabase): Promise<void> {
    if (!await this.authorize(database)) throw new AdmissionRetentionError(ADMISSION_ERROR_CODE.permissionDenied);
    if (await this.readRecoveryLock(database)) throw new AdmissionRetentionError(ADMISSION_ERROR_CODE.resourceUnavailable);
    if (!await this.authorize(database)) throw new AdmissionRetentionError(ADMISSION_ERROR_CODE.permissionDenied);
  }
  /** @param command - Total row ceiling across all original imports. @returns Counts only after the executor confirms commit. @throws AdmissionRetentionError with private cause for an unresolved SQL/commit outcome. */
  async purge(command: { limit: number }): Promise<AllowlistImportMaterialRetentionResult> {
    if (!Number.isInteger(command.limit) || command.limit < 1 || command.limit > ADMISSION_IMPORT_MATERIAL_RETENTION.maximumRowLimit) throw new AdmissionRetentionError(ADMISSION_ERROR_CODE.invalidInput);
    try {
      await this.assertAuthority();
      return await this.execute(async (database) => {
        await this.assertAuthority(database);
        const row = (await database.execute<{ purged_rows: number; completed_imports: number }>(sql`select purged_rows,completed_imports from public.purge_expired_allowlist_import_material(${command.limit})`)).rows[0];
        await this.assertAuthority(database);
        return { purgedRows: row.purged_rows, completedImports: row.completed_imports };
      });
    } catch (error) {
      if (error instanceof AdmissionRetentionError) throw error;
      throw new AdmissionRetentionError(ADMISSION_ERROR_CODE.operationUnresolved, { cause: error });
    }
  }
}
