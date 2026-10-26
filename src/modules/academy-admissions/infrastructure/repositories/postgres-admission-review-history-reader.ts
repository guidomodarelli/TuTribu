/** Reads one request's minimal retained history with current native authority and the SQL-owned access fact. @module postgres-admission-review-history-reader */
import "server-only";
import { sql } from "drizzle-orm";
import type { RequestDatabase } from "@/src/modules/shared/infrastructure/database/server-database-client";
import type { AdmissionCommandScope } from "../../domain/repositories/admission-repositories";
import type { AdmissionReviewHistoryReader, AdmissionReviewHistoryFilters } from "../../domain/repositories/admission-review-history-reader";
import { AdmissionOperationError } from "../../domain/errors/admission-operation-error";
import { canPerformAdmissionAction } from "../../domain/policies/admission-eligibility";
import { ADMISSION_ACTION } from "../../constants/admission-eligibility";
import { ADMISSION_ERROR_CODE } from "../../constants/admission-errors";
import { ADMISSION_REVIEW_CURSOR_SEPARATOR } from "../../constants/admission-public-contract";
import { PostgresAdmissionAuthorizationReader } from "./postgres-admission-authorization-reader";
import { mapAdmissionReviewHistoryStorage, type AdmissionReviewHistoryStorageRow } from "./admission-review-history-storage-mapper";

/** The request root binds the real account/session to a guarded transaction. */
type ReviewHistoryExecutor = <Result>(scope: AdmissionCommandScope, run: (database: RequestDatabase) => Promise<Result>) => Promise<Result>;

/** No hosting key, provider resource, global audit or mutation owner participates. */
export class PostgresAdmissionReviewHistoryReader implements AdmissionReviewHistoryReader {
  /** @param execute - Native identity-bound guarded executor. */
  constructor(private readonly execute: ReviewHistoryExecutor) {}

  /** @param database - Existing protected transaction. @param scope - Actual native account/session/tribe. @returns After current membership and session liveness remain allowed. */
  private async authorize(database: RequestDatabase, scope: AdmissionCommandScope): Promise<void> {
    const locked = (await database.execute<{ locked: boolean }>(sql`select public.lock_academy_admission_administrative_reader(${scope.tribeId},${scope.sessionId}) as locked where public.current_app_user_id()=${scope.userId}`)).rows[0]?.locked;
    if (!locked) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    const actor = await new PostgresAdmissionAuthorizationReader(database, scope.sessionId, ADMISSION_ACTION.readReviewHistory).getCurrentActor(scope.tribeId, scope.userId);
    if (!actor) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.authenticationRequired);
    if (!canPerformAdmissionAction(actor, ADMISSION_ACTION.readReviewHistory, { tribeId: scope.tribeId })) throw new AdmissionOperationError(ADMISSION_ERROR_CODE.permissionDenied);
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
