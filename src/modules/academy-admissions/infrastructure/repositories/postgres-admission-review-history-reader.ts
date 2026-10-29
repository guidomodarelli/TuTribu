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

  /** @param scope - Native identity and exact tribe. @param admissionRequestId - One explicit target request. @param filters - Validated bounded limit and original SQL tuple. @returns Domain facts and the unrounded cursor after native access recording and final authority. */
  readHistory(scope: AdmissionCommandScope, admissionRequestId: string, filters: AdmissionReviewHistoryFilters) {
    return this.execute(scope, async (database) => {
      await this.authorize(database, scope);
      const rows = (await database.execute<AdmissionReviewHistoryStorageRow>(sql`select * from public.read_admission_review_history(${scope.tribeId},${scope.sessionId},${admissionRequestId},${filters.limit + 1},${filters.cursor?.at ?? null},${filters.cursor?.id ?? null})`)).rows;
      await this.authorize(database, scope);
      const selected = rows.slice(0, filters.limit), last = selected.at(-1);
      return { records: selected.map(mapAdmissionReviewHistoryStorage), nextCursor: rows.length > filters.limit && last ? `${last.cursor_at}${ADMISSION_REVIEW_CURSOR_SEPARATOR}${last.id}` : null };
    });
  }
}
