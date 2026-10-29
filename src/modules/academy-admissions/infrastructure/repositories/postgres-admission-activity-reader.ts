/** Reads native leader-scoped activity/metrics and records authorized access in the same transaction. @module postgres-admission-activity-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionCommandScope } from "../../domain/repositories/admission-repositories";
import type { AdmissionActivityReader, AdmissionActivityFilters } from "../../application/ports/admission-activity-reader";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ADMISSION_ACTIVITY_QUERY } from "../../constants/admission-activity";
import { authorizeAdmissionAdministrativeReader } from "./authorize-admission-administrative-reader";
import { mapAdmissionActivityStorage, mapAdmissionMetricsStorage, type AdmissionActivityStorageRow, type AdmissionMetricsStorage } from "./admission-activity-storage-mapper";

/** Composition binds the current native account to every checkout. */
export type AdmissionActivityExecutor = <Value>(scope: AdmissionCommandScope, run: (database: RequestDatabase) => Promise<Value>) => Promise<Value>;
/** No credential, provider, keyring or mutable usage configuration participates in these reads. */
export class PostgresAdmissionActivityReader implements AdmissionActivityReader {
  /** @param execute - Native identity-bound guarded executor. */
  constructor(private readonly execute: AdmissionActivityExecutor) {}
  /** @param database - Current transaction. @param scope - Actual account/session/tribe. @returns After native locks and live permission checks. */
  private async authorize(database: RequestDatabase, scope: AdmissionCommandScope): Promise<void> {
    await authorizeAdmissionAdministrativeReader(database, scope, ADMISSION_ACTION.readAudit);
    const current = (await database.execute<{ id: string }>(sql`select id from public.session where id=${scope.sessionId} and "userId"=${scope.userId} and "expiresAt">clock_timestamp()`)).rows[0];
    if (!current) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
  }
  /** @param database - Existing read transaction. @param scope - Native authorized identity. @param surface - Closed read surface. @param itemCount - Only successfully projected selected items. @returns After the read fact and a final liveness check, with no fake command ledger/version. */
  private async exposure(database: RequestDatabase, scope: AdmissionCommandScope, surface: "activity" | "metrics", itemCount: number): Promise<void> {
    await this.authorize(database, scope);
    const recorded = (await database.execute<{ recorded: boolean }>(sql`select public.record_academy_admission_authorized_exposure(${scope.tribeId},${scope.sessionId},${surface},${itemCount}) as recorded`)).rows[0]?.recorded;
    await this.authorize(database, scope);
    if (!recorded) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
  }
  /** @param scope - Native authorized selection. @param filters - Validated bounded filters. @returns Exact scoped rows, cursor and safe metadata, committed with their access record. */
  readActivity(scope: AdmissionCommandScope, filters: AdmissionActivityFilters) {
    return this.execute(scope, async (database) => {
      await this.authorize(database, scope);
      const rows = (await database.execute<AdmissionActivityStorageRow>(sql`select * from public.read_academy_admission_activity(${scope.tribeId},${scope.sessionId},${filters.limit + 1},${filters.resourceType ?? null},${filters.resourceId ?? null},${filters.cursor?.at ?? null},${filters.cursor?.id ?? null})`)).rows;
      const selected = rows.slice(0, filters.limit), last = selected.at(-1);
      const nextCursor = rows.length > filters.limit && last ? `${last.cursor_at}${ADMISSION_ACTIVITY_QUERY.cursorSeparator}${last.id}` : null;
      const result = mapAdmissionActivityStorage(scope.tribeId, selected, nextCursor);
      await this.exposure(database, scope, "activity", result.items.length);
      return result;
    });
  }
  /** @param scope - Exact native current leader. @returns Actual same-tribe aggregate snapshot; read-only counters/configuration remain unchanged. */
  readMetrics(scope: AdmissionCommandScope) {
    return this.execute(scope, async (database) => {
      await this.authorize(database, scope);
      const row = (await database.execute<{ record: AdmissionMetricsStorage | null }>(sql`select public.read_academy_admission_metrics(${scope.tribeId},${scope.sessionId}) as record`)).rows[0];
      if (!row?.record) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
      const result = mapAdmissionMetricsStorage(row.record, scope.tribeId);
      await this.exposure(database, scope, "metrics", 1);
      return result;
    });
  }
}
