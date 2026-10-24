/** Minimizes terminal contents and expired security audit under live maintenance/restore authority. @module postgres-admission-private-data-retention */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionPrivateDataRetention, AdmissionPrivateDataRetentionCommand, AdmissionPrivateDataRetentionResult } from "../../domain/repositories/admission-private-data-retention";
import { AdmissionRetentionError } from "../../domain/errors/admission-retention-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_PRIVATE_DATA_RETENTION } from "../../constants/admission-retention";

/** Owns the existing guarded maintenance checkout without nested connections or provider access. */
export type AdmissionPrivateRetentionExecutor = <Result>(run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;
/** Rechecks live backend authorization or restore state without loading decryption material. */
export type AdmissionPrivateRetentionGate = (database?: RequestDatabase) => Promise<boolean>;
/** Contains only columns consumed from the private SQL function, without backend schema revalidation. */
type PrivateRetentionRow = { requests_minimized: number; audit_events_purged: number; archived_audit_events_purged: number; remaining_requests: boolean; remaining_audit_events: boolean };

/** Publishes aggregate counts only after atomic SQL destruction and post-operation authority checks. */
export class PostgresAdmissionPrivateDataRetention implements AdmissionPrivateDataRetention {
  /** @param execute - Original guarded maintenance executor. @param authorize - Current backend principal. @param readRecoveryLock - Current restore stop, independent of all keyrings. */
  constructor(private readonly execute: AdmissionPrivateRetentionExecutor, private readonly authorize: AdmissionPrivateRetentionGate, private readonly readRecoveryLock: AdmissionPrivateRetentionGate) {}

  /** @param database - Current transaction when available. @returns After both live gates and post-await authority permit destruction. @throws AdmissionRetentionError for withdrawn authority or restore stop. */
  private async assertAuthority(database?: RequestDatabase): Promise<void> {
    if (!await this.authorize(database)) throw new AdmissionRetentionError(ADMISSION_ERROR_CODE.permissionDenied, undefined, ADMISSION_PRIVATE_DATA_RETENTION.operation);
    if (await this.readRecoveryLock(database)) throw new AdmissionRetentionError(ADMISSION_ERROR_CODE.resourceUnavailable, undefined, ADMISSION_PRIVATE_DATA_RETENTION.operation);
    if (!await this.authorize(database)) throw new AdmissionRetentionError(ADMISSION_ERROR_CODE.permissionDenied, undefined, ADMISSION_PRIVATE_DATA_RETENTION.operation);
  }

  /** @param command - Application-owned ceilings; SQL enforces its independent private boundary. @returns Confirmed minimized/purged counts without contents, fingerprints or private resource IDs. @throws AdmissionRetentionError preserving an uncertain SQL/commit cause. */
  async purge(command: AdmissionPrivateDataRetentionCommand): Promise<AdmissionPrivateDataRetentionResult> {
    try {
      await this.assertAuthority();
      return await this.execute(async (database) => {
        await this.assertAuthority(database);
        const row = (await database.execute<PrivateRetentionRow>(sql`select * from public.purge_admission_private_data(${command.requestLimit},${command.auditLimit})`)).rows[0];
        if (!row) throw new AdmissionRetentionError(ADMISSION_ERROR_CODE.operationUnresolved, undefined, ADMISSION_PRIVATE_DATA_RETENTION.operation);
        await this.assertAuthority(database);
        return { requestsMinimized: row.requests_minimized, auditEventsPurged: row.audit_events_purged, archivedAuditEventsPurged: row.archived_audit_events_purged, remainingRequests: row.remaining_requests, remainingAuditEvents: row.remaining_audit_events };
      });
    } catch (error) {
      if (error instanceof AdmissionRetentionError) throw error;
      throw new AdmissionRetentionError(ADMISSION_ERROR_CODE.operationUnresolved, { cause: error }, ADMISSION_PRIVATE_DATA_RETENTION.operation);
    }
  }
}
