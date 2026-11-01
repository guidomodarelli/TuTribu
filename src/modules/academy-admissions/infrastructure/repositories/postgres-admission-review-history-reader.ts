/** Reads one request's minimal retained history with current native authority and the SQL-owned access fact. @module postgres-admission-review-history-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionCommandScope } from "../../domain/repositories/admission-repositories";
import type { AdmissionReviewHistoryReader, AdmissionReviewHistoryFilters } from "../../domain/repositories/admission-review-history-reader";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ADMISSION_REVIEW_CURSOR_SEPARATOR } from "../../constants/admission-public-contract";
import { authorizeAdmissionAdministrativeReader } from "./authorize-admission-administrative-reader";
import { mapAdmissionReviewHistoryStorage, type AdmissionReviewHistoryStorageRow } from "./admission-review-history-storage-mapper";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { POSTGRES_ERROR_CODE, readPostgresErrorCode } from "@/src/modules/shared/infrastructure/database/postgres-error";
import { readLiveAdmissionSession } from "./postgres-admission-administrative-exposure";

/** The request root binds the real account/session to a guarded transaction. */
type ReviewHistoryExecutor = <Result>(scope: AdmissionCommandScope, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;

/** No hosting key, provider resource, global audit or mutation owner participates. */
export class PostgresAdmissionReviewHistoryReader implements AdmissionReviewHistoryReader {
  /** @param execute - Native identity-bound guarded executor. */
  constructor(private readonly execute: ReviewHistoryExecutor) {}

  /** @param database - Existing protected transaction. @param scope - Actual native account/session/tribe. @returns After current membership and session liveness remain allowed. */
  private async authorize(database: RequestDatabase, scope: AdmissionCommandScope): Promise<void> {
    await authorizeAdmissionAdministrativeReader(database, scope, ADMISSION_ACTION.readReviewHistory);
  }

  /**
   * @param scope - Native identity and exact tribe. @param admissionRequestId - One explicit target request. @param filters - Validated bounded limit and original SQL tuple.
   * @returns Domain facts and the unrounded cursor after native access recording and final authority.
   * @throws AdmissionOperationError `authentication_required` when the access fact was refused (SQLSTATE 42501) because the session ended
   * between the checks, or `request_conflict` when the session is live and the request changed during the read; both keep the SQL error as cause.
   */
  async readHistory(scope: AdmissionCommandScope, admissionRequestId: string, filters: AdmissionReviewHistoryFilters) {
    try { return await this.readHistoryPage(scope, admissionRequestId, filters); }
    catch (error) {
      if (readPostgresErrorCode(error) !== POSTGRES_ERROR_CODE.insufficientPrivilege) throw error;
      // The refused access fact aborted its transaction, so the session is checked in a new one.
      const live = await this.execute(scope, (database) => readLiveAdmissionSession(database, scope));
      throw new AdmissionOperationError(live ? ADMISSION_ERROR_CODE.requestConflict : ADMISSION_ERROR_CODE.authenticationRequired, { cause: error });
    }
  }

  /** @param scope - Native identity and exact tribe. @param admissionRequestId - One explicit target request. @param filters - Validated bounded limit and original SQL tuple. @returns One page read and recorded in one guarded transaction. */
  private readHistoryPage(scope: AdmissionCommandScope, admissionRequestId: string, filters: AdmissionReviewHistoryFilters) {
    return this.execute(scope, async (database) => {
      await this.authorize(database, scope);
      const rows = (await database.execute<AdmissionReviewHistoryStorageRow>(sql`select * from public.read_admission_review_history(${scope.tribeId},${scope.sessionId},${admissionRequestId},${filters.limit + 1},${filters.cursor?.at ?? null},${filters.cursor?.id ?? null})`)).rows;
      await this.authorize(database, scope);
      const selected = rows.slice(0, filters.limit), last = selected.at(-1);
      return { records: selected.map(mapAdmissionReviewHistoryStorage), nextCursor: rows.length > filters.limit && last ? `${last.cursor_at}${ADMISSION_REVIEW_CURSOR_SEPARATOR}${last.id}` : null };
    });
  }
}
